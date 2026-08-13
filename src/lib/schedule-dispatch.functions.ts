/**
 * Agendamento no servidor: em vez de o navegador ficar aberto disparando um
 * e-mail por vez, a fila inteira é guardada na campanha e um robô do servidor
 * (cron) envia respeitando a janela de horário e o intervalo escolhidos.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Recipient } from "./bulk-email";
import type { SendSchedule } from "./send-schedule";

export type QueuedMessage = { email: string; subject: string; html: string };

export type ScheduleInput = {
  campaignId: string;
  schedule: SendSchedule;
  messages: QueuedMessage[];
  senderName: string;
  senderEmail: string;
  recipients?: Recipient[];
  brief?: string;
};

export const scheduleCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ScheduleInput) => data)
  .handler(async ({ data, context }) => {
    if (data.messages.length === 0) throw new Error("Nenhum e-mail pronto para agendar.");
    if (!data.senderEmail.trim()) throw new Error("Escolha o remetente verificado.");

    const patch: Record<string, unknown> = {
      status: "agendado",
      schedule: data.schedule,
      queue: data.messages,
      next_send_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      finished_at: null,
      sender_name: data.senderName,
      sender_email: data.senderEmail,
      total_count: data.messages.length,
      sent_count: 0,
      results: [],
    };
    if (data.recipients) patch["recipients"] = data.recipients;
    if (data.brief !== undefined) patch["brief"] = data.brief;

    const { error } = await context.supabase
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.campaignId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, queued: data.messages.length };
  });

/** Cancela um disparo programado e devolve a campanha para rascunho. */
export const cancelScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: "rascunho", queue: [], next_send_at: null } as any)
      .eq("id", data.campaignId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
