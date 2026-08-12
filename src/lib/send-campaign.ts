import type { SendBulkPayload, SendResult } from "./bulk-email";
import { sendBulkEmailsFn } from "./send-email.functions";

/**
 * Dispatches the campaign through the server function that talks to Brevo.
 * Falls back to a per-recipient error entry when the call fails so the UI can
 * always show a log.
 */
export async function sendBulkEmails(
  payload: SendBulkPayload & { campaignId?: string; dailyLimit?: number },
): Promise<SendResult[]> {
  try {
    return await sendBulkEmailsFn({ data: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return payload.recipients.map((recipient) => ({
      email: recipient["email"] ?? "",
      success: false,
      error: message,
    }));
  }
}
