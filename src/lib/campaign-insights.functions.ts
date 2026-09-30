import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runUserScopedOperation, type LooseClient } from "./user-scoped-query";

export const INSIGHT_METRICS = [
  { id: "entregas", label: "Entregas e falhas" },
  { id: "cliques", label: "Cliques nos links" },
  { id: "horarios", label: "Horários e dias de clique" },
  { id: "tempos", label: "Tempo entre envio e clique" },
  { id: "leads", label: "Leads da Página Ponte" },
  { id: "logs", label: "Logs recentes (amostra)" },
] as const;

export type InsightMetricId = (typeof INSIGHT_METRICS)[number]["id"];

const schema = z.object({
  campaignId: z.string().uuid(),
  metrics: z
    .array(z.enum(["entregas", "cliques", "horarios", "tempos", "leads", "logs"]))
    .min(1, "Selecione ao menos uma métrica"),
  question: z.string().trim().max(500).optional(),
});

async function fetchAll<T>(
  client: LooseClient,
  build: (c: LooseClient) => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await runUserScopedOperation(client, (c) =>
      build(c).range(from, from + 999),
    );
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return d ? `${(u ?? "").slice(0, 2)}***@${d}` : "***";
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export const analyzeCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const uid = context.userId;
    const { data: campaign, error: cErr } = await runUserScopedOperation(supabase, (c) =>
      c.from("campaigns").select("id,name,status,created_at").eq("id", data.campaignId).eq("user_id", uid).maybeSingle(),
    );
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Disparo não encontrado.");

    type Ev = { email: string; status: string; reason: string | null; sent_at: string };
    type Tr = { id: string; recipient_email: string; click_count: number; first_clicked_at: string | null; created_at: string; mode: string };
    const events = await fetchAll<Ev>(supabase, (c) =>
      c.from("email_events").select("email,status,reason,sent_at").eq("user_id", uid).eq("campaign_id", data.campaignId).order("sent_at"),
    );
    const tracks = await fetchAll<Tr>(supabase, (c) =>
      c.from("email_link_tracks").select("id,recipient_email,click_count,first_clicked_at,created_at,mode").eq("user_id", uid).eq("campaign_id", data.campaignId).order("created_at"),
    );

    const m = new Set(data.metrics);
    const facts: Record<string, unknown> = {
      disparo: { nome: (campaign as { name: string }).name, status: (campaign as { status: string }).status },
      observacao: "Aberturas (pixel) não são registradas por este app; use cliques como sinal principal de engajamento.",
    };
    const sentAt = new Map(events.map((e) => [e.email.toLowerCase(), e.sent_at]));

    if (m.has("entregas")) {
      const byStatus: Record<string, number> = {};
      const reasons: Record<string, number> = {};
      const domains: Record<string, { total: number; falhas: number }> = {};
      for (const e of events) {
        byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
        const fail = !["enviado", "entregue"].includes(e.status);
        if (fail && e.reason) reasons[e.reason.slice(0, 80)] = (reasons[e.reason.slice(0, 80)] ?? 0) + 1;
        const d = e.email.split("@")[1]?.toLowerCase() ?? "?";
        domains[d] ??= { total: 0, falhas: 0 };
        domains[d].total++;
        if (fail) domains[d].falhas++;
      }
      facts.entregas = {
        total_eventos: events.length,
        por_status: byStatus,
        principais_motivos_falha: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 10),
        top_dominios: Object.entries(domains).sort((a, b) => b[1].total - a[1].total).slice(0, 12),
      };
    }
    const clicked = tracks.filter((t) => t.click_count > 0);
    if (m.has("cliques")) {
      const domClicks: Record<string, number> = {};
      for (const t of clicked) {
        const d = t.recipient_email.split("@")[1]?.toLowerCase() ?? "?";
        domClicks[d] = (domClicks[d] ?? 0) + 1;
      }
      facts.cliques = {
        links_gerados: tracks.length,
        destinatarios_que_clicaram: clicked.length,
        cliques_totais: tracks.reduce((s, t) => s + t.click_count, 0),
        taxa_clique_sobre_links: tracks.length ? +((clicked.length / tracks.length) * 100).toFixed(2) : 0,
        cliques_repetidos: clicked.filter((t) => t.click_count > 1).length,
        dominios_com_mais_cliques: Object.entries(domClicks).sort((a, b) => b[1] - a[1]).slice(0, 10),
      };
    }
    if (m.has("horarios") || m.has("tempos")) {
      const ids = clicked.map((t) => t.id);
      const clicks: { occurred_at: string; email_link_track_id: string }[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const part = await fetchAll<{ occurred_at: string; email_link_track_id: string }>(supabase, (c) =>
          c.from("email_link_click_events").select("occurred_at,email_link_track_id").in("email_link_track_id", ids.slice(i, i + 200)),
        );
        clicks.push(...part);
      }
      if (m.has("horarios")) {
        const hours: Record<string, number> = {};
        const days: Record<string, number> = {};
        const dn = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
        for (const c of clicks) {
          const d = new Date(new Date(c.occurred_at).getTime() - 3 * 3600_000);
          hours[`${d.getUTCHours()}h`] = (hours[`${d.getUTCHours()}h`] ?? 0) + 1;
          days[dn[d.getUTCDay()]!] = (days[dn[d.getUTCDay()]!] ?? 0) + 1;
        }
        facts.horarios_clique_brt = { por_hora: hours, por_dia: days };
      }
      if (m.has("tempos")) {
        const mins: number[] = [];
        for (const t of clicked) {
          const s = sentAt.get(t.recipient_email.toLowerCase()) ?? t.created_at;
          if (t.first_clicked_at) mins.push((Date.parse(t.first_clicked_at) - Date.parse(s)) / 60000);
        }
        const valid = mins.filter((x) => x >= 0);
        const bucket = (a: number, b: number) => valid.filter((x) => x >= a && x < b).length;
        facts.tempo_envio_ate_clique_min = {
          amostras: valid.length,
          mediana: median(valid)?.toFixed(1) ?? null,
          ate_1h: bucket(0, 60),
          de_1h_a_24h: bucket(60, 1440),
          de_1_a_3_dias: bucket(1440, 4320),
          mais_de_3_dias: bucket(4320, Infinity),
        };
      }
    }
    if (m.has("leads")) {
      const bridgeIds = tracks.filter((t) => t.mode === "bridge").map((t) => t.id);
      let leads = 0;
      for (let i = 0; i < bridgeIds.length; i += 200) {
        const { count } = await runUserScopedOperation(supabase, (c) =>
          c.from("link_leads").select("id", { count: "exact", head: true }).eq("user_id", uid).in("email_link_track_id", bridgeIds.slice(i, i + 200)),
        );
        leads += count ?? 0;
      }
      facts.leads = {
        links_pagina_ponte: bridgeIds.length,
        leads_capturados: leads,
        conversao_clique_para_lead: clicked.length ? +((leads / clicked.length) * 100).toFixed(1) : 0,
      };
    }
    if (m.has("logs")) {
      facts.logs_recentes = events.slice(-40).map((e) => ({
        email: maskEmail(e.email),
        status: e.status,
        motivo: e.reason?.slice(0, 80) ?? null,
        enviado_em: e.sent_at,
      }));
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA não configurada.");
    const prompt = `Você é um analista de e-mail marketing B2B. Analise os dados do disparo abaixo e responda em português do Brasil, em Markdown, com as seções: "Resumo do desempenho", "Padrões de abertura e clique", "Pontos de atenção" e "Ações sugeridas" (lista numerada, práticas e priorizadas). Seja objetivo (máx. ~450 palavras), cite números e não invente dados que não estão no JSON.${data.question ? `\n\nPergunta do gestor: ${data.question}` : ""}\n\nDADOS:\n${JSON.stringify(facts)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-6-astra", input: prompt, reasoning: { effort: "low" } }),
    });
    if (res.status === 429) throw new Error("Muitas análises seguidas. Aguarde um instante e tente de novo.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    if (!res.ok) throw new Error(`Falha na análise (${res.status}).`);
    const json = (await res.json()) as {
      output_text?: string;
      output?: { type: string; content?: { type: string; text?: string }[] }[];
    };
    const text =
      json.output_text ??
      (json.output ?? [])
        .filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .map((c) => c.text ?? "")
        .join("");
    return { summary: text || "Sem resposta da IA.", facts };
  });
