import { createServerFn } from "@tanstack/react-start";

import { sendCampaignViaBrevo } from "./brevo.server";
import type { Recipient, SendBulkPayload } from "./bulk-email";

export const sendBulkEmailsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SendBulkPayload) => data)
  .handler(async ({ data }) => sendCampaignViaBrevo(data));

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
