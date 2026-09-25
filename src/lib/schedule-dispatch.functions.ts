/**
 * Agendamento no servidor: em vez de o navegador ficar aberto disparando um
 * e-mail por vez, a fila inteira é guardada na campanha e um robô do servidor
 * (cron) envia respeitando a janela de horário e o intervalo escolhidos.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Recipient } from "./bulk-email";
import { brtDateKey, nextSlotAt, parseSchedule, type SendSchedule } from "./send-schedule";
import { requireTrackableLink } from "./trackable-link";

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
    // Todo e-mail precisa de link http/https para virar link rastreável por destinatário.
    for (const message of data.messages) requireTrackableLink(message.html);

    const schedule = parseSchedule(data.schedule);
    const patch: Record<string, unknown> = {
      status: "agendado",
      schedule,
      send_plan: schedule,
      queue: data.messages,
      paused: false,
      daily_sent_count: 0,
      daily_sent_date: brtDateKey(),
      next_send_at: nextSlotAt(schedule).toISOString(),
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

    // O banco às vezes responde 502/503/504 (instabilidade temporária). Tenta de novo.
    let lastMessage = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
      const { error } = await context.supabase
        .from("campaigns")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", data.campaignId)
        .eq("user_id", context.userId);
      if (!error) return { ok: true, queued: data.messages.length };
      lastMessage = error.message ?? "";
      const transient = /50[234]|bad gateway|gateway|timeout|<html/i.test(lastMessage);
      if (!transient) throw new Error(lastMessage);
    }
    console.error("[scheduleCampaign] falha temporária persistente:", lastMessage.slice(0, 200));
    throw new Error(
      "O servidor ficou instável ao salvar a programação. Aguarde alguns segundos e tente de novo.",
    );
  });

/** Pausa ou retoma um disparo programado, sem perder a fila. */
export const setCampaignPausedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId: string; paused: boolean }) => data)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { paused: data.paused };
    if (!data.paused) patch["next_send_at"] = new Date().toISOString();
    const { error } = await context.supabase
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.campaignId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, paused: data.paused };
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
