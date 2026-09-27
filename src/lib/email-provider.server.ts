/**
 * Escolhe o provedor de envio de e-mail. Hoje: "brevo" (padrão) ou "resend".
 * A troca é feita pela variável de ambiente EMAIL_PROVIDER — sem mexer em
 * nenhuma tela: fila, agendamento, rastreio e relatórios continuam iguais.
 *
 * Para ativar a Resend: vincular o conector Resend ao projeto (gera o
 * segredo RESEND_API_KEY) e definir EMAIL_PROVIDER=resend. No plano free da
 * Resend, o remetente precisa ser onboarding@resend.dev e só entrega para o
 * e-mail do dono da conta; para produção, verifique um domínio na Resend.
 */
import type { SendBulkPayload, SendResult } from "./bulk-email";
import { sendCampaignViaBrevo, sendSimpleCampaignViaBrevo } from "./brevo.server";
import type { EmailTrackingContext } from "./email-link-tracking.server";
import { sendCampaignViaResend, sendSimpleCampaignViaResend } from "./resend.server";

export type EmailProvider = "brevo" | "resend";

export function getEmailProvider(): EmailProvider {
  return process.env["EMAIL_PROVIDER"] === "resend" ? "resend" : "brevo";
}

type SimplePayload = {
  senderName: string;
  senderEmail: string;
  messages: { email: string; subject: string; html: string }[];
};

export async function sendCampaign(
  payload: SendBulkPayload,
  tracking?: EmailTrackingContext,
  tag?: string,
): Promise<SendResult[]> {
  return getEmailProvider() === "resend"
    ? sendCampaignViaResend(payload, tracking, tag)
    : sendCampaignViaBrevo(payload, tracking, tag);
}

export async function sendSimpleCampaign(
  payload: SimplePayload,
  tracking?: EmailTrackingContext,
  tag?: string,
): Promise<SendResult[]> {
  return getEmailProvider() === "resend"
    ? sendSimpleCampaignViaResend(payload, tracking, tag)
    : sendSimpleCampaignViaBrevo(payload, tracking, tag);
}
