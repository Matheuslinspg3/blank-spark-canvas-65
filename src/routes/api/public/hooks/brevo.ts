/**
 * Webhook da Brevo: recebe entregas, bounces e reclamações de spam,
 * atualiza o evento correspondente e bloqueia o contato quando necessário.
 * A URL leva um segredo (?s=...) para ninguém falsificar eventos.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { EmailEventStatus, SuppressionReason } from "@/lib/deliverability";

type BrevoEvent = {
  event?: string;
  email?: string;
  "message-id"?: string;
  messageId?: string;
  reason?: string;
  date?: string;
};

const STATUS_BY_EVENT: Record<string, EmailEventStatus> = {
  delivered: "entregue",
  hard_bounce: "bounce_hard",
  soft_bounce: "bounce_soft",
  spam: "spam",
  complaint: "spam",
  blocked: "bloqueado",
  invalid_email: "invalido",
  error: "erro",
  deferred: "enviado",
};

const SUPPRESS_BY_EVENT: Record<string, SuppressionReason> = {
  hard_bounce: "bounce",
  spam: "spam",
  complaint: "spam",
  blocked: "spam",
  invalid_email: "invalido",
  unsubscribed: "manual",
};

async function handle(event: BrevoEvent) {
  const type = (event.event ?? "").toLowerCase();
  const email = (event.email ?? "").trim().toLowerCase();
  const messageId = (event["message-id"] ?? event.messageId ?? "").trim();
  if (!email || !type) return;

  const status = STATUS_BY_EVENT[type];
  const now = new Date().toISOString();

  if (status) {
    let query = supabaseAdmin
      .from("email_events")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status, reason: event.reason ?? null, updated_status_at: now } as any)
      .eq("email", email);
    query = messageId ? query.eq("message_id", messageId) : query.eq("status", "enviado");
    const { error } = await query;
    if (error) console.error(`[brevo-webhook] update falhou: ${error.message}`);
  }

  const reason = SUPPRESS_BY_EVENT[type];
  if (!reason) return;

  // Descobre o dono do contato pelos eventos já registrados.
  const { data: owners } = await supabaseAdmin
    .from("email_events")
    .select("user_id")
    .eq("email", email)
    .limit(50);

  const userIds = [...new Set((owners ?? []).map((row: { user_id: string }) => row.user_id))];
  if (userIds.length === 0) return;

  const { error } = await supabaseAdmin.from("suppressions").upsert(
    userIds.map((userId) => ({
      user_id: userId,
      email,
      reason,
      source: `brevo:${type}`,
      detail: event.reason ?? null,
    })),
    { onConflict: "user_id,email" },
  );
  if (error) console.error(`[brevo-webhook] supressão falhou: ${error.message}`);
}

export const Route = createFileRoute("/api/public/hooks/brevo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BREVO_WEBHOOK_SECRET"];
        const provided = new URL(request.url).searchParams.get("s");
        if (!secret || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const events = Array.isArray(payload) ? payload : [payload];
        for (const event of events) await handle(event as BrevoEvent);

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
