import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EmailEvent, Suppression, SuppressionReason } from "./deliverability";
import { runUserScopedOperation } from "./user-scoped-query";

/** Eventos de uma campanha (base do relatório de entregabilidade). */
export const listCampaignEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await runUserScopedOperation(context.supabase, (client) =>
      client
        .from("email_events")
        .select("id, campaign_id, email, message_id, status, reason, sent_at, updated_status_at")
        .eq("user_id", context.userId)
        .eq("campaign_id", data.campaignId)
        .order("sent_at", { ascending: false }),
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as EmailEvent[];
  });

/** Quantos e-mails saíram nas últimas 24h — usado no controle de limite. */
export const getDailyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await runUserScopedOperation(context.supabase, (client) =>
      client
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .gte("sent_at", since),
    );
    // Contagem é apenas informativa: nunca derruba a tela.
    if (error) return { sentLast24h: 0, unavailable: true as const };
    return { sentLast24h: count ?? 0 };
  });

export const listSuppressions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await runUserScopedOperation(context.supabase, (client) =>
      client
        .from("suppressions")
        .select("id, email, reason, source, detail, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Suppression[];
  });

export const addSuppression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; reason?: SuppressionReason; detail?: string }) => input)
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    if (!email) throw new Error("Informe um e-mail.");
    const { error } = await context.supabase.from("suppressions").upsert(
      {
        user_id: context.userId,
        email,
        reason: data.reason ?? "manual",
        source: "manual",
        detail: data.detail ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { onConflict: "user_id,email" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeSuppression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("suppressions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Segredo do webhook da Brevo, para montar a URL mostrada em Configurações. */
export const getWebhookSecret = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ secret: process.env["BREVO_WEBHOOK_SECRET"] ?? "" }));

/** Importa os eventos da API da Brevo (padrão: últimos 30 dias). */
export const syncBrevoEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { syncBrevoEvents } = await import("./brevo-sync.server");
    const days = Math.min(90, Math.max(1, Math.round(Number(data.days ?? 30))));
    return syncBrevoEvents(context.supabase, context.userId, days);
  });
