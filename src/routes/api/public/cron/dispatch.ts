/**
 * Robô de disparos programados: chamado a cada minuto pelo agendador do banco.
 * Continua as campanhas com status "agendado", enviando um e-mail por vez,
 * respeitando janela de horário, intervalo, supressões e limite diário.
 * A URL leva um segredo (?s=...) guardado no banco.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSimpleCampaign } from "@/lib/email-provider.server";
import type { SendResult } from "@/lib/bulk-email";
import { blockedResult, buildGuard, logSendResults } from "@/lib/deliverability.server";
import type { QueuedMessage } from "@/lib/schedule-dispatch.functions";
import { escapeHtml } from "@/lib/bulk-email";
import { parseTemplatePlan } from "@/lib/template-dispatch";
import { brtDateKey, isWithinPlanTz, nextSlotAt, parseSchedule } from "@/lib/send-schedule";

/**
 * Fila compacta: quando a mensagem não traz o HTML pronto, monta a partir do
 * molde guardado no plano da campanha (brief), trocando as variáveis {{coluna}}.
 */
function resolveHtml(row: Row, message: QueuedMessage): string {
  if (message.html || !message.templateId) return message.html;
  const template = parseTemplatePlan(row.brief).templates.find(
    (item) => item.id === message.templateId,
  );
  if (!template) return message.html;
  const body = message.variant === "B" && template.bodyB ? template.bodyB : template.body;
  const vars = message.vars ?? {};
  return body.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? escapeHtml(vars[key] ?? "") : match,
  );
}

/** Quantas campanhas são atendidas por chamada. */
const MAX_CAMPAIGNS = 5;

type Row = {
  id: string;
  user_id: string;
  schedule: unknown;
  brief: string | null;
  queue: QueuedMessage[] | null;
  results: SendResult[] | null;
  sent_count: number;
  sender_name: string;
  sender_email: string;
  daily_sent_count: number | null;
  daily_sent_date: string | null;
};

async function processCampaign(row: Row): Promise<string> {
  const schedule = parseSchedule(row.schedule);
  const queue = Array.isArray(row.queue) ? row.queue : [];

  if (queue.length === 0) {
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: "concluido",
        finished_at: new Date().toISOString(),
        next_send_at: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .eq("id", row.id);
    return "vazio";
  }

  const today = brtDateKey();
  const sentToday = row.daily_sent_date === today ? (row.daily_sent_count ?? 0) : 0;

  if (!isWithinPlanTz(schedule)) {
    await supabaseAdmin
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ next_send_at: nextSlotAt(schedule).toISOString() } as any)
      .eq("id", row.id);
    return "fora-da-janela";
  }

  // Cota do dia atingida: retoma no primeiro horário permitido do próximo dia.
  if (schedule.enabled && sentToday >= schedule.dailyLimit) {
    await supabaseAdmin
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ next_send_at: nextSlotAt(schedule, new Date(), true).toISOString() } as any)
      .eq("id", row.id);
    return "cota-diaria";
  }

  const [message, ...rest] = queue;
  if (!message) return "vazio";

  const guard = await buildGuard(supabaseAdmin, row.user_id, schedule.dailyLimit);
  let result: SendResult;

  if (guard.suppressed.has(message.email.trim().toLowerCase())) {
    result = blockedResult(message.email, "suppressed");
  } else if (guard.remaining <= 0) {
    // Limite diário atingido: tenta de novo daqui a 30 minutos.
    await supabaseAdmin
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ next_send_at: nextSlotAt(schedule, new Date(), true).toISOString() } as any)
      .eq("id", row.id);
    return "limite-diario";
  } else {
    const [sent] = await sendSimpleCampaign(
      {
        senderName: row.sender_name,
        senderEmail: row.sender_email,
        messages: [
          { email: message.email, subject: message.subject, html: resolveHtml(row, message) },
        ],
      },
      { supabase: supabaseAdmin, userId: row.user_id, campaignId: row.id },
      // Tags extras do e-mail (campanha, categoria, variação…) separadas por "|".
      [row.id, ...(Array.isArray(message.tags) ? message.tags : [])].join("|"),
    );
    result = sent ?? { email: message.email, success: false, error: "Sem resposta do provedor." };
    await logSendResults(supabaseAdmin, row.user_id, row.id, [result]);
  }

  const results = [...(row.results ?? []), result];
  const sentCount = results.filter((item) => item.success).length;
  const done = rest.length === 0;
  const intervalMs = (schedule.enabled ? schedule.intervalSeconds : 1) * 1000;
  const nextAt = done
    ? null
    : result.success
      ? nextSlotAt(schedule, new Date(Date.now() + intervalMs)).toISOString()
      : // Falhou: segue logo para o próximo, sem esperar o intervalo inteiro.
        nextSlotAt(schedule, new Date(Date.now() + 5000)).toISOString();

  await supabaseAdmin
    .from("campaigns")
    .update({
      queue: rest,
      results,
      sent_count: sentCount,
      status: done ? (sentCount > 0 ? "concluido" : "erro") : "agendado",
      next_send_at: nextAt,
      // Só e-mails entregues contam para a cota: falhas não gastam o limite do dia.
      daily_sent_count: sentToday + (result.success ? 1 : 0),
      daily_sent_date: today,
      finished_at: done ? new Date().toISOString() : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("id", row.id);

  // Atualiza a cópia em memória para permitir mais envios na mesma execução.
  row.queue = rest;
  row.results = results;
  row.daily_sent_count = sentToday + (result.success ? 1 : 0);
  row.daily_sent_date = today;
  if (done) return "concluido";
  return result.success ? "enviado" : "falha";
}

async function run(request: Request): Promise<Response> {
  const provided = new URL(request.url).searchParams.get("s");
  const { data: config } = await supabaseAdmin
    .from("cron_config")
    .select("dispatch_secret")
    .eq("id", 1)
    .maybeSingle();
  const secret = (config as { dispatch_secret?: string } | null)?.dispatch_secret;
  if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, user_id, schedule, brief, queue, results, sent_count, sender_name, sender_email, daily_sent_count, daily_sent_date",
    )
    .eq("status", "agendado")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("paused" as any, false as any)
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(MAX_CAMPAIGNS);

  if (error) return new Response(error.message, { status: 500 });

  // O robô roda 1x por minuto. Para intervalos menores que 60s (ex.: 30s),
  // cada campanha envia várias mensagens na mesma execução, respeitando o intervalo.
  const startedAt = Date.now();
  const BUDGET_MS = 50_000;
  const rows = (data ?? []) as unknown as Row[];
  const outcomes: Record<string, string> = {};
  const nextDue = new Map<string, number>(rows.map((r) => [r.id, startedAt]));

  while (nextDue.size > 0) {
    const [id, due] = [...nextDue.entries()].sort((a, b) => a[1] - b[1])[0]!;
    if (due - startedAt > BUDGET_MS) break;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const row = rows.find((r) => r.id === id)!;
    let outcome: string;
    try {
      outcome = await processCampaign(row);
    } catch (err) {
      outcome = err instanceof Error ? err.message : "erro";
      console.error(`[cron-dispatch] campanha ${row.id} falhou`, err);
    }
    outcomes[id] = outcome;
    if (outcome !== "enviado" && outcome !== "falha") {
      nextDue.delete(id);
      continue;
    }
    const schedule = parseSchedule(row.schedule);
    const intervalMs = (schedule.enabled ? schedule.intervalSeconds : 60) * 1000;
    const gap = outcome === "falha" ? 5000 : intervalMs;
    if (gap >= 60_000) nextDue.delete(id);
    else nextDue.set(id, Date.now() + gap);
  }

  return new Response(JSON.stringify({ ok: true, processed: outcomes }), {
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/cron/dispatch")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
