/**
 * Robô de disparos programados: chamado a cada minuto pelo agendador do banco.
 * Continua as campanhas com status "agendado", enviando um e-mail por vez,
 * respeitando janela de horário, intervalo, supressões e limite diário.
 * A URL leva um segredo (?s=...) guardado no banco.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSimpleCampaignViaBrevo } from "@/lib/brevo.server";
import type { SendResult } from "@/lib/bulk-email";
import { blockedResult, buildGuard, logSendResults } from "@/lib/deliverability.server";
import type { QueuedMessage } from "@/lib/schedule-dispatch.functions";
import { isWithinWindowTz, parseSchedule } from "@/lib/send-schedule";

/** Quantas campanhas são atendidas por chamada. */
const MAX_CAMPAIGNS = 5;

type Row = {
  id: string;
  user_id: string;
  schedule: unknown;
  queue: QueuedMessage[] | null;
  results: SendResult[] | null;
  sent_count: number;
  sender_name: string;
  sender_email: string;
};

async function processCampaign(row: Row): Promise<string> {
  const schedule = parseSchedule(row.schedule);
  const queue = Array.isArray(row.queue) ? row.queue : [];

  if (queue.length === 0) {
    await supabaseAdmin
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: "concluido", finished_at: new Date().toISOString(), next_send_at: null } as any)
      .eq("id", row.id);
    return "vazio";
  }

  if (!isWithinWindowTz(schedule)) {
    await supabaseAdmin
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ next_send_at: new Date(Date.now() + 5 * 60_000).toISOString() } as any)
      .eq("id", row.id);
    return "fora-da-janela";
  }

  const [message, ...rest] = queue;
  if (!message) return "vazio";

  const guard = await buildGuard(supabaseAdmin, row.user_id, undefined);
  let result: SendResult;

  if (guard.suppressed.has(message.email.trim().toLowerCase())) {
    result = blockedResult(message.email, "suppressed");
  } else if (guard.remaining <= 0) {
    // Limite diário atingido: tenta de novo daqui a 30 minutos.
    await supabaseAdmin
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ next_send_at: new Date(Date.now() + 30 * 60_000).toISOString() } as any)
      .eq("id", row.id);
    return "limite-diario";
  } else {
    const [sent] = await sendSimpleCampaignViaBrevo({
      senderName: row.sender_name,
      senderEmail: row.sender_email,
      messages: [message],
    }, { supabase: supabaseAdmin, userId: row.user_id, campaignId: row.id });
    result = sent ?? { email: message.email, success: false, error: "Sem resposta do provedor." };
    await logSendResults(supabaseAdmin, row.user_id, row.id, [result]);
  }

  const results = [...(row.results ?? []), result];
  const sentCount = results.filter((item) => item.success).length;
  const done = rest.length === 0;
  const intervalMs = (schedule.enabled ? schedule.intervalSeconds : 1) * 1000;

  await supabaseAdmin
    .from("campaigns")
    .update({
      queue: rest,
      results,
      sent_count: sentCount,
      status: done ? (sentCount > 0 ? "concluido" : "erro") : "agendado",
      next_send_at: done ? null : new Date(Date.now() + intervalMs).toISOString(),
      finished_at: done ? new Date().toISOString() : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq("id", row.id);

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
    .select("id, user_id, schedule, queue, results, sent_count, sender_name, sender_email")
    .eq("status", "agendado")
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(MAX_CAMPAIGNS);

  if (error) return new Response(error.message, { status: 500 });

  const outcomes: Record<string, string> = {};
  for (const row of (data ?? []) as unknown as Row[]) {
    try {
      outcomes[row.id] = await processCampaign(row);
    } catch (err) {
      outcomes[row.id] = err instanceof Error ? err.message : "erro";
      console.error(`[cron-dispatch] campanha ${row.id} falhou`, err);
    }
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
