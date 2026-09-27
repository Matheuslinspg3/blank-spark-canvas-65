/**
 * Escolhe o provedor de envio de e-mail: "brevo" (padrão), "resend" ou
 * "both" (divide os destinatários entre as duas, alternando um a um).
 * A troca é feita pela variável de ambiente EMAIL_PROVIDER — sem mexer em
 * nenhuma tela: fila, agendamento, rastreio e relatórios continuam iguais.
 *
 * No modo "both", a metade enviada pela Resend usa o remetente definido em
 * RESEND_SENDER_EMAIL (padrão: contato@cafcm.org.br), porque a Resend só
 * envia a partir de domínios verificados na conta — o remetente da Brevo
 * (ex: matheuslinspg@gmail.com) não é aceito lá.
 */
import type { SendBulkPayload, SendResult } from "./bulk-email";
import { sendCampaignViaBrevo, sendSimpleCampaignViaBrevo } from "./brevo.server";
import type { EmailTrackingContext } from "./email-link-tracking.server";
import { sendCampaignViaResend, sendSimpleCampaignViaResend } from "./resend.server";

export type EmailProvider = "brevo" | "resend" | "both";

export function getEmailProvider(): EmailProvider {
  const value = process.env["EMAIL_PROVIDER"];
  if (value === "resend") return "resend";
  if (value === "both") return "both";
  return "brevo";
}

/** Remetente usado na fatia enviada pela Resend no modo "both". */
function resendSender(): { name: string; email: string } {
  return {
    name: process.env["RESEND_SENDER_NAME"] ?? "CAFCM",
    email: process.env["RESEND_SENDER_EMAIL"] ?? "contato@cafcm.org.br",
  };
}

type SimplePayload = {
  senderName: string;
  senderEmail: string;
  messages: { email: string; subject: string; html: string }[];
};

/** Divide uma lista em duas, alternando item a item (índices pares e ímpares). */
function splitAlternating<T>(items: T[]): [T[], T[]] {
  const even: T[] = [];
  const odd: T[] = [];
  items.forEach((item, index) => (index % 2 === 0 ? even : odd).push(item));
  return [even, odd];
}

export async function sendCampaign(
  payload: SendBulkPayload,
  tracking?: EmailTrackingContext,
  tag?: string,
): Promise<SendResult[]> {
  const provider = getEmailProvider();
  if (provider === "resend") return sendCampaignViaResend(payload, tracking, tag);
  if (provider === "brevo") return sendCampaignViaBrevo(payload, tracking, tag);

  // Modo "both": metade dos destinatários sai pela Brevo, metade pela Resend.
  const [brevoRecipients, resendRecipients] = splitAlternating(payload.recipients);
  const sender = resendSender();

  const [brevoResults, resendResults] = await Promise.all([
    brevoRecipients.length
      ? sendCampaignViaBrevo({ ...payload, recipients: brevoRecipients }, tracking, tag)
      : Promise.resolve([] as SendResult[]),
    resendRecipients.length
      ? sendCampaignViaResend(
          {
            ...payload,
            senderName: sender.name,
            senderEmail: sender.email,
            recipients: resendRecipients,
          },
          tracking,
          tag,
        )
      : Promise.resolve([] as SendResult[]),
  ]);

  return [...brevoResults, ...resendResults];
}

export async function sendSimpleCampaign(
  payload: SimplePayload,
  tracking?: EmailTrackingContext,
  tag?: string,
): Promise<SendResult[]> {
  const provider = getEmailProvider();
  if (provider === "resend") return sendSimpleCampaignViaResend(payload, tracking, tag);
  if (provider === "brevo") return sendSimpleCampaignViaBrevo(payload, tracking, tag);

  const [brevoMessages, resendMessages] = splitAlternating(payload.messages);
  const sender = resendSender();

  const [brevoResults, resendResults] = await Promise.all([
    brevoMessages.length
      ? sendSimpleCampaignViaBrevo({ ...payload, messages: brevoMessages }, tracking, tag)
      : Promise.resolve([] as SendResult[]),
    resendMessages.length
      ? sendSimpleCampaignViaResend(
          {
            ...payload,
            senderName: sender.name,
            senderEmail: sender.email,
            messages: resendMessages,
          },
          tracking,
          tag,
        )
      : Promise.resolve([] as SendResult[]),
  ]);

  return [...brevoResults, ...resendResults];
}
