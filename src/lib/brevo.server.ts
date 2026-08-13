/**
 * Server-only Brevo sender. Calls are routed through the Lovable connector
 * gateway, which injects the Brevo credentials of the linked connection.
 */
import {
  htmlToPlainText,
  interpolate,
  renderEmailHtml,
  type SendBulkPayload,
  type SendResult,
} from "./bulk-email";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
/** Brevo is called at most once per second to respect the campaign rate limit. */
const DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Quantas tentativas extras em falhas temporárias (429 / 5xx / rede). */
const MAX_RETRIES = 3;

/**
 * Envia um e-mail pela Brevo com novas tentativas automáticas quando a falha é
 * temporária (limite de taxa, instabilidade 5xx ou queda de conexão).
 */
async function postEmail(
  lovableApiKey: string,
  brevoKey: string,
  body: unknown,
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  let lastError = "Erro desconhecido";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(2000 * attempt);

    try {
      const response = await fetch(`${GATEWAY_URL}/smtp/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableApiKey}`,
          "X-Connection-Api-Key": brevoKey,
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      if (response.ok) {
        let messageId: string | undefined;
        try {
          messageId = (JSON.parse(text) as { messageId?: string }).messageId;
        } catch {
          messageId = undefined;
        }
        return { ok: true, ...(messageId ? { messageId } : {}) };
      }

      console.error(`Brevo send failed [${response.status}]: ${text}`);
      lastError = `Brevo ${response.status}: ${text}`;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) return { ok: false, error: lastError };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Erro desconhecido";
    }
  }

  return { ok: false, error: lastError };
}

export async function sendCampaignViaBrevo(payload: SendBulkPayload): Promise<SendResult[]> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const brevoKey = process.env["BREVO_API_KEY"];

  if (!lovableApiKey || !brevoKey) {
    return payload.recipients.map((recipient) => ({
      email: recipient["email"] ?? "",
      success: false,
      error: "Conexão com a Brevo não configurada.",
    }));
  }

  if (!isEmail(payload.senderEmail)) {
    return payload.recipients.map((recipient) => ({
      email: recipient["email"] ?? "",
      success: false,
      error: "E-mail do remetente inválido.",
    }));
  }

  const results: SendResult[] = [];

  for (const [index, recipient] of payload.recipients.entries()) {
    const email = (recipient["email"] ?? "").trim();

    if (!isEmail(email)) {
      results.push({ email, success: false, error: "E-mail inválido." });
      continue;
    }

    if (index > 0) await sleep(DELAY_MS);

    const htmlContent = renderEmailHtml(payload.htmlTemplate, recipient);

    const outcome = await postEmail(lovableApiKey, brevoKey, {
      sender: { name: payload.senderName, email: payload.senderEmail },
      to: [{ email }],
      subject: interpolate(payload.subject, recipient),
      htmlContent,
      // Versão em texto puro + sem rastreio: sinais que ajudam o e-mail a
      // cair na caixa principal em vez da aba Promoções.
      textContent: htmlToPlainText(htmlContent),
    });

    results.push(
      outcome.ok
        ? { email, success: true, ...(outcome.messageId ? { messageId: outcome.messageId } : {}) }
        : { email, success: false, error: outcome.error },
    );
  }

  return results;
}

export type SimpleSendPayload = {
  senderName: string;
  senderEmail: string;
  /** Um item por destinatário, com assunto e HTML já prontos. */
  messages: { email: string; subject: string; html: string }[];
};

/**
 * Disparo simples: cada destinatário tem assunto e corpo próprios, gerados
 * pela IA. Mesmo rate limit de 1 e-mail por segundo.
 */
export async function sendSimpleCampaignViaBrevo(
  payload: SimpleSendPayload,
): Promise<SendResult[]> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const brevoKey = process.env["BREVO_API_KEY"];

  if (!lovableApiKey || !brevoKey) {
    return payload.messages.map((message) => ({
      email: message.email,
      success: false,
      error: "Conexão com a Brevo não configurada.",
    }));
  }

  if (!isEmail(payload.senderEmail)) {
    return payload.messages.map((message) => ({
      email: message.email,
      success: false,
      error: "E-mail do remetente inválido.",
    }));
  }

  const results: SendResult[] = [];

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

    const outcome = await postEmail(lovableApiKey, brevoKey, {
      sender: { name: payload.senderName, email: payload.senderEmail },
      to: [{ email }],
      subject: message.subject.trim(),
      htmlContent: message.html,
      textContent: htmlToPlainText(message.html),
    });

    results.push(
      outcome.ok
        ? { email, success: true, ...(outcome.messageId ? { messageId: outcome.messageId } : {}) }
        : { email, success: false, error: outcome.error },
    );
  }

  return results;
}
