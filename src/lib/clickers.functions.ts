import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runUserScopedOperation, type LooseClient } from "./user-scoped-query";

export type Clicker = {
  id: string;
  recipient_email: string;
  campaign_id: string | null;
  campaign_name: string | null;
  click_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  sent_at: string | null;
  mode: "redirect" | "bridge";
  destination_url: string;
};

const filterSchema = z.object({
  campaignId: z.string().uuid().optional(),
  // datas "AAAA-MM-DD" interpretadas no horário de Brasília (UTC-3)
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  bridgeOnly: z.boolean().optional(),
});

type TrackRow = {
  id: string;
  recipient_email: string;
  campaign_id: string | null;
  click_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  email_event_id: string | null;
  sent_at: string | null;
  mode: string;
  destination_url: string;
};

const brtStart = (d: string) => new Date(`${d}T00:00:00-03:00`).toISOString();
const brtEnd = (d: string) => new Date(`${d}T23:59:59.999-03:00`).toISOString();

async function fetchClickers(
  supabase: LooseClient,
  userId: string,
  f: z.infer<typeof filterSchema>,
): Promise<TrackRow[]> {
  const rows: TrackRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await runUserScopedOperation(supabase, (c) => {
      let q = c
        .from("email_link_tracks")
        .select(
          "id,recipient_email,campaign_id,click_count,first_clicked_at,last_clicked_at,email_event_id,mode,destination_url",
        )
        .eq("user_id", userId)
        .gt("click_count", 0)
        .order("last_clicked_at", { ascending: false })
        .range(from, from + 999);
      if (f.campaignId) q = q.eq("campaign_id", f.campaignId);
      if (f.bridgeOnly) q = q.eq("mode", "bridge");
      if (f.from) q = q.gte("first_clicked_at", brtStart(f.from));
      if (f.to) q = q.lte("first_clicked_at", brtEnd(f.to));
      return q;
    });
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as TrackRow[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  // Data de envio: vem do evento de e-mail vinculado ao link
  const eventIds = [...new Set(rows.map((t) => t.email_event_id).filter(Boolean))] as string[];
  const sentAt = new Map<string, string>();
  for (let i = 0; i < eventIds.length; i += 200) {
    const { data: events } = await runUserScopedOperation(supabase, (c) =>
      c
        .from("email_events")
        .select("id,sent_at")
        .eq("user_id", userId)
        .in("id", eventIds.slice(i, i + 200)),
    );
    for (const e of (events ?? []) as { id: string; sent_at: string | null }[])
      if (e.sent_at) sentAt.set(e.id, e.sent_at);
  }
  for (const t of rows) t.sent_at = t.email_event_id ? (sentAt.get(t.email_event_id) ?? null) : null;
  return rows;
}

export const listClickersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => filterSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<Clicker[]> => {
    const supabase = context.supabase as unknown as LooseClient;
    const tracks = await fetchClickers(supabase, context.userId, data);
    const campIds = [...new Set(tracks.map((t) => t.campaign_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    for (let i = 0; i < campIds.length; i += 200) {
      const { data: camps } = await runUserScopedOperation(supabase, (c) =>
        c
          .from("campaigns")
          .select("id,name")
          .eq("user_id", context.userId)
          .in("id", campIds.slice(i, i + 200)),
      );
    for (const c of (camps ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
    }
    return tracks.map((t) => ({
      id: t.id,
      recipient_email: t.recipient_email,
      campaign_id: t.campaign_id,
      campaign_name: t.campaign_id ? (names.get(t.campaign_id) ?? null) : null,
      click_count: t.click_count,
      first_clicked_at: t.first_clicked_at,
      last_clicked_at: t.last_clicked_at,
      sent_at: t.email_event_id ? (sentAt.get(t.email_event_id) ?? null) : null,
      mode: t.mode === "bridge" ? "bridge" : "redirect",
      destination_url: t.destination_url,
    }));
  });

const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return d ? `${(u ?? "").slice(0, 2)}***@${d}` : "***";
};

const analyzeSchema = filterSchema.extend({
  question: z.string().trim().max(500).optional(),
});

/** Pergunta à IA sobre a lista filtrada de quem clicou (e-mails mascarados). */
export const analyzeClickersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => analyzeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const tracks = await fetchClickers(supabase, context.userId, data);

    const byDomain: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    const byHour: Record<string, number> = {};
    let totalClicks = 0;
    for (const t of tracks) {
      totalClicks += t.click_count;
      const d = t.recipient_email.split("@")[1]?.toLowerCase() ?? "?";
      byDomain[d] = (byDomain[d] ?? 0) + 1;
      if (t.first_clicked_at) {
        const brt = new Date(new Date(t.first_clicked_at).getTime() - 3 * 3600_000);
        const day = brt.toISOString().slice(0, 10);
        byDay[day] = (byDay[day] ?? 0) + 1;
        const h = `${brt.getUTCHours()}h`;
        byHour[h] = (byHour[h] ?? 0) + 1;
      }
    }

    const facts = {
      filtro: {
        periodo: { de: data.from ?? null, ate: data.to ?? null, fuso: "America/Sao_Paulo" },
        somente_pagina_ponte: data.bridgeOnly ?? false,
      },
      destinatarios_que_clicaram: tracks.length,
      cliques_totais: totalClicks,
      cliques_por_dia: byDay,
      cliques_por_hora_brt: byHour,
      dominios_com_mais_cliques: Object.entries(byDomain)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
      amostra_mascarada: tracks.slice(0, 30).map((t) => ({
        email: maskEmail(t.recipient_email),
        enviado_em: t.email_event_id ? (sentAtMap.get(t.email_event_id) ?? null) : null,
        cliques: t.click_count,
        primeiro_clique: t.first_clicked_at,
        tipo: t.mode,
      })),
    };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA não configurada.");
    const prompt = `Você é um analista de e-mail marketing B2B. Analise os dados de cliques abaixo e responda em português do Brasil, em Markdown, de forma objetiva (máx. ~300 palavras). Cite números e não invente dados que não estão no JSON.${data.question ? `\n\nPergunta do gestor: ${data.question}` : "\n\nResuma quem clicou, quando e os padrões encontrados."}\n\nDADOS:\n${JSON.stringify(facts)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: prompt,
        reasoning: { effort: "low" },
      }),
    });
    if (res.status === 429)
      throw new Error("Muitas análises seguidas. Aguarde um instante e tente de novo.");
    if (res.status === 402)
      throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
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
    return { summary: text || "Sem resposta da IA.", total: tracks.length };
  });
