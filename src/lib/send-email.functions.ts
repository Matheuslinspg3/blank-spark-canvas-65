import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  sendCampaignViaBrevo,
  sendSimpleCampaignViaBrevo,
  type SimpleSendPayload,
} from "./brevo.server";
import type { Recipient, SendBulkPayload, SendResult } from "./bulk-email";
import { blockedResult, buildGuard, logSendResults } from "./deliverability.server";

/** Campos extras aceitos por todos os disparos. */
type GuardInput = { campaignId?: string; dailyLimit?: number };

export const sendBulkEmailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendBulkPayload & GuardInput) => data)
  .handler(async ({ data, context }) => {
    const guard = await buildGuard(context.supabase, context.userId, data.dailyLimit);

    const allowed: Recipient[] = [];
    const results: SendResult[] = [];
    for (const recipient of data.recipients) {
      const email = (recipient["email"] ?? "").trim();
      if (guard.suppressed.has(email.toLowerCase())) {
        results.push(blockedResult(email, "suppressed"));
        continue;
      }
      if (allowed.length >= guard.remaining) {
        results.push(blockedResult(email, "limit"));
        continue;
      }
      allowed.push(recipient);
    }

    const sent =
      allowed.length > 0
        ? await sendCampaignViaBrevo(
            { ...data, recipients: allowed },
            { supabase: context.supabase, userId: context.userId, campaignId: data.campaignId },
          )
        : [];
    await logSendResults(context.supabase, context.userId, data.campaignId ?? null, sent);
    return [...sent, ...results];
  });

/** Disparo simples: assunto e corpo já prontos por destinatário. */
export const sendSimpleEmailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SimpleSendPayload & GuardInput) => data)
  .handler(async ({ data, context }) => {
    const guard = await buildGuard(context.supabase, context.userId, data.dailyLimit);

    const allowed: SimpleSendPayload["messages"] = [];
    const results: SendResult[] = [];
    for (const message of data.messages) {
      const email = message.email.trim();
      if (guard.suppressed.has(email.toLowerCase())) {
        results.push(blockedResult(email, "suppressed"));
        continue;
      }
      if (allowed.length >= guard.remaining) {
        results.push(blockedResult(email, "limit"));
        continue;
      }
      allowed.push(message);
    }

    const sent =
      allowed.length > 0
        ? await sendSimpleCampaignViaBrevo(
            { ...data, messages: allowed },
            { supabase: context.supabase, userId: context.userId, campaignId: data.campaignId },
          )
        : [];
    await logSendResults(context.supabase, context.userId, data.campaignId ?? null, sent);
    return [...sent, ...results];
  });

export type SendTestPayload = {
  to: string;
  recipient: Recipient;
  subject: string;
  htmlTemplate: string;
  senderName: string;
  senderEmail: string;
};

/** Envia uma única cópia de teste, usando os dados de um destinatário real. */
export const sendTestEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendTestPayload) => data)
  .handler(async ({ data }) => {
    const [result] = await sendCampaignViaBrevo({
      senderName: data.senderName,
      senderEmail: data.senderEmail,
      subject: `[TESTE] ${data.subject}`,
      htmlTemplate: data.htmlTemplate,
      recipients: [{ ...data.recipient, email: data.to }],
    });
    return result ?? { email: data.to, success: false, error: "Sem resposta do provedor." };
  });
