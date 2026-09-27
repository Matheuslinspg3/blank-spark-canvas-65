/**
 * Server-only Resend sender. Preparado para quando o conector Resend for
 * vinculado ao projeto: as chamadas passam pelo gateway da Lovable, que
 * injeta as credenciais da conexão. Enquanto a conexão não existir, o
 * provedor ativo continua sendo a Brevo (ver email-provider.server.ts).
 *
 * Plano free da Resend: só entrega a partir de onboarding@resend.dev e
 * apenas para o e-mail do dono da conta. Para enviar aos usuários do app,
 * verifique um domínio no painel da Resend e use-o como remetente.
 */
import {
  htmlToPlainText,
  interpolate,
  renderEmailHtml,
  type SendBulkPayload,
  type SendResult,
} from "./bulk-email";
import { createTrackedHtml, type EmailTrackingContext } from "./email-link-tracking.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
/** Mesmo ritmo da Brevo: no máximo 1 envio por segundo. */
const DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Quantas tentativas extras em falhas temporárias (429 / 5xx / rede). */
const MAX_RETRIES = 3;

async function postEmail(
  lovableApiKey: string,
  resendKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  let lastError = "Erro desconhecido";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(2000 * attempt);

    try {
      const response = await fetch(`${GATEWAY_URL}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableApiKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      if (response.ok) {
        let messageId: string | undefined;
        try {
          messageId = (JSON.parse(text) as { id?: string }).id;
        } catch {
          messageId = undefined;
        }
        return { ok: true, ...(messageId ? { messageId } : {}) };
      }

      console.error(`Resend send failed [${response.status}]: ${text}`);
      lastError = `Resend ${response.status}: ${text}`;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) return { ok: false, error: lastError };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Erro desconhecido";
    }
  }

  return { ok: false, error: lastError };
}

function missingKey(messages: { email?: string }[]): SendResult[] {
  return messages.map((message) => ({
    email: message.email ?? "",
    success: false,
    error: "Conexão com a Resend não configurada.",
  }));
}

export async function sendCampaignViaResend(
  payload: SendBulkPayload,
  tracking?: EmailTrackingContext,
  tag?: string,
): Promise<SendResult[]> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];

  if (!lovableApiKey || !resendKey) return missingKey(payload.recipients);

  if (!isEmail(payload.senderEmail)) {
    return payload.recipients.map((recipient) => ({
      email: recipient["email"] ?? "",
      success: false,
      error: "E-mail do remetente inválido.",
    }));
  }

  const results: SendResult[] = [];
  const from = `${payload.senderName} <${payload.senderEmail}>`;
  const tags = tag ? [{ name: "campaign", value: tag.split("|")[0]!.replace(/[^A-Za-z0-9_-]/g, "_") }] : undefined;

  for (const [index, recipient] of payload.recipients.entries()) {
    const email = (recipient["email"] ?? "").trim();

    if (!isEmail(email)) {
      results.push({ email, success: false, error: "E-mail inválido." });
      continue;
    }

    if (index > 0) await sleep(DELAY_MS);

    const rendered = renderEmailHtml(payload.htmlTemplate, recipient);
    const tracked = await createTrackedHtml(rendered, recipient, tracking);
    const htmlContent = tracked.html;

    const outcome = await postEmail(lovableApiKey, resendKey, {
      from,
      to: [email],
      subject: interpolate(payload.subject, recipient),
      html: htmlContent,
      text: htmlToPlainText(htmlContent),
      ...(tags ? { tags } : {}),
    });

    results.push(
      outcome.ok
        ? {
            email,
            success: true,
            ...(outcome.messageId ? { messageId: outcome.messageId } : {}),
            ...(tracked.trackingLinkIds.length ? { trackingLinkIds: tracked.trackingLinkIds } : {}),
          }
        : { email, success: false, error: outcome.error },
    );
  }

  return results;
}

export type SimpleSendPayload = {
  senderName: string;
  senderEmail: string;
  messages: { email: string; subject: string; html: string }[];
};

export async function sendSimpleCampaignViaResend(
  payload: SimpleSendPayload,
  tracking?: EmailTrackingContext,
  tag?: string,
): Promise<SendResult[]> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];

  if (!lovableApiKey || !resendKey) return missingKey(payload.messages);

  if (!isEmail(payload.senderEmail)) {
    return payload.messages.map((message) => ({
      email: message.email,
      success: false,
      error: "E-mail do remetente inválido.",
    }));
  }

  const results: SendResult[] = [];
  const from = `${payload.senderName} <${payload.senderEmail}>`;
  const tags = tag ? [{ name: "campaign", value: tag.split("|")[0]!.replace(/[^A-Za-z0-9_-]/g, "_") }] : undefined;

  for (const [index, message] of payload.messages.entries()) {
    const email = message.email.trim();

    if (!isEmail(email)) {
      results.push({ email, success: false, error: "E-mail inválido." });
      continue;
    }
    if (!message.subject.trim() || !message.html.trim()) {
      results.push({ email, success: false, error: "Assunto ou texto vazio." });
      continue;
    }

    if (index > 0) await sleep(DELAY_MS);

    const tracked = await createTrackedHtml(message.html, { email }, tracking);
    const outcome = await postEmail(lovableApiKey, resendKey, {
      from,
      to: [email],
      subject: message.subject.trim(),
      html: tracked.html,
      text: htmlToPlainText(tracked.html),
      ...(tags ? { tags } : {}),
    });

    results.push(
      outcome.ok
        ? {
            email,
            success: true,
            ...(outcome.messageId ? { messageId: outcome.messageId } : {}),
            ...(tracked.trackingLinkIds.length ? { trackingLinkIds: tracked.trackingLinkIds } : {}),
          }
        : { email, success: false, error: outcome.error },
    );
  }

  return results;
}
