/**
 * Server-only Brevo sender. Calls are routed through the Lovable connector
 * gateway, which injects the Brevo credentials of the linked connection.
 */
import { interpolate, type SendBulkPayload, type SendResult } from "./bulk-email";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
/** Brevo is called at most once per second to respect the campaign rate limit. */
const DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

    try {
      const response = await fetch(`${GATEWAY_URL}/smtp/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableApiKey}`,
          "X-Connection-Api-Key": brevoKey,
        },
        body: JSON.stringify({
          sender: { name: payload.senderName, email: payload.senderEmail },
          to: [{ email }],
          subject: interpolate(payload.subject, recipient),
          htmlContent: interpolate(payload.htmlTemplate, recipient),
        }),
      });

      const body = await response.text();

      if (!response.ok) {
        console.error(`Brevo send failed [${response.status}]: ${body}`);
        results.push({ email, success: false, error: `Brevo ${response.status}: ${body}` });
        continue;
      }

      let messageId: string | undefined;
      try {
        messageId = (JSON.parse(body) as { messageId?: string }).messageId;
      } catch {
        messageId = undefined;
      }

      results.push({ email, success: true, ...(messageId ? { messageId } : {}) });
    } catch (error) {
      results.push({
        email,
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }

  return results;
}
