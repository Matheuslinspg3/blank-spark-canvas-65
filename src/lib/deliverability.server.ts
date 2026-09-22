/**
 * Guardas de entregabilidade aplicadas no servidor antes/depois de cada envio:
 * supressão automática, limite diário e registro do evento para o relatório.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SendResult } from "./bulk-email";
import { clampLimit } from "./deliverability";
import { attachTracksToEmailEvent } from "./email-link-tracking.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

/** Endereços bloqueados do usuário (bounce, spam, inválido ou manual). */
export async function loadSuppressedSet(supabase: Client, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("suppressions").select("email").eq("user_id", userId);
  if (error) {
    console.error(`[deliverability] falha ao ler supressões: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((row: { email: string }) => row.email.trim().toLowerCase()));
}

/** Quantos e-mails saíram nas últimas 24h (base do limite diário). */
export async function countSentLast24h(supabase: Client, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("email_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("sent_at", since);
  if (error) {
    console.error(`[deliverability] falha ao contar envios: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/** Grava um evento por e-mail efetivamente entregue à Brevo (ou com erro). */
export async function logSendResults(
  supabase: Client,
  userId: string,
  campaignId: string | null,
  results: SendResult[],
): Promise<void> {
  for (const result of results.filter((item) => !item.blocked)) {
    const { data, error } = await supabase
      .from("email_events")
      .insert({
        user_id: userId,
        campaign_id: campaignId,
        email: result.email.trim().toLowerCase(),
        message_id: result.messageId ?? null,
        status: result.success ? "enviado" : "erro",
        reason: result.error ?? null,
      } as any)
      .select("id")
      .single();
    if (error || !data) {
      console.error(`[deliverability] falha ao registrar envio: ${error?.message ?? "sem evento"}`);
      continue;
    }
    await attachTracksToEmailEvent(supabase, userId, data.id, result.trackingLinkIds);
  }
}

export type Guard = {
  suppressed: Set<string>;
  remaining: number;
  dailyLimit: number;
};

export async function buildGuard(
  supabase: Client,
  userId: string,
  dailyLimit: number | undefined,
): Promise<Guard> {
  const limit = clampLimit(Number(dailyLimit ?? 200));
  const [suppressed, sent] = await Promise.all([
    loadSuppressedSet(supabase, userId),
    countSentLast24h(supabase, userId),
  ]);
  return { suppressed, remaining: Math.max(0, limit - sent), dailyLimit: limit };
}

/** Resultado pronto quando o contato está bloqueado ou o limite estourou. */
export function blockedResult(email: string, kind: "suppressed" | "limit"): SendResult {
  return {
    email,
    success: false,
    blocked: kind,
    error:
      kind === "suppressed"
        ? "Contato bloqueado (bounce ou reclamação de spam anterior)."
        : "Limite diário de envio atingido.",
  };
}
