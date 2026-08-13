/**
 * Sincronização com a API da Brevo: busca os eventos transacionais dos últimos
 * dias (entregue, bounce, spam, bloqueado…) e atualiza a tabela email_events.
 * Serve para recuperar o histórico anterior ao webhook ou conferir divergências.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmailEventStatus, SuppressionReason } from "./deliverability";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const STATUS_BY_EVENT: Record<string, EmailEventStatus> = {
  requests: "enviado",
  delivered: "entregue",
  hardBounces: "bounce_hard",
  hard_bounce: "bounce_hard",
  softBounces: "bounce_soft",
  soft_bounce: "bounce_soft",
  spam: "spam",
  complaints: "spam",
  blocked: "bloqueado",
  invalid: "invalido",
  invalid_email: "invalido",
  error: "erro",
  deferred: "enviado",
};

const SUPPRESS_BY_EVENT: Record<string, SuppressionReason> = {
  hardBounces: "bounce",
  hard_bounce: "bounce",
  spam: "spam",
  complaints: "spam",
  blocked: "spam",
  invalid: "invalido",
  invalid_email: "invalido",
  unsubscribed: "manual",
};

/** Prioridade: um evento final nunca é rebaixado para "enviado". */
const RANK: Record<EmailEventStatus, number> = {
  enviado: 0,
  entregue: 1,
  bounce_soft: 2,
  erro: 2,
  bloqueado: 3,
  invalido: 3,
  spam: 4,
  bounce_hard: 4,
};

type BrevoEvent = {
  email?: string;
  event?: string;
  messageId?: string;
  date?: string;
  reason?: string;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchEvents(days: number): Promise<BrevoEvent[]> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const brevoKey = process.env["BREVO_API_KEY"];
  if (!lovableApiKey || !brevoKey) throw new Error("Conexão com a Brevo não configurada.");

  const endDate = isoDay(new Date());
  const startDate = isoDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const all: BrevoEvent[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${GATEWAY_URL}/smtp/statistics/events?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&startDate=${startDate}&endDate=${endDate}&sort=desc`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": brevoKey,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`[brevo-sync] falha [${response.status}]: ${text}`);
      throw new Error(`Brevo respondeu ${response.status}: ${text.slice(0, 200)}`);
    }
    let events: BrevoEvent[] = [];
    try {
      events = (JSON.parse(text) as { events?: BrevoEvent[] }).events ?? [];
    } catch {
      events = [];
    }
    all.push(...events);
    if (events.length < PAGE_SIZE) break;
  }

  return all;
}

export type SyncSummary = { fetched: number; updated: number; inserted: number; suppressed: number };

/**
 * Importa os eventos da Brevo para o usuário atual. Casa pelo message_id e,
 * quando não existe registro, cria um evento avulso (sem campanha).
 */
export async function syncBrevoEvents(
  supabase: Client,
  userId: string,
  days: number,
): Promise<SyncSummary> {
  const events = await fetchEvents(days);
  const summary: SyncSummary = { fetched: events.length, updated: 0, inserted: 0, suppressed: 0 };
  if (events.length === 0) return summary;

  const { data: existing, error } = await supabase
    .from("email_events")
    .select("id, email, message_id, status")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  type Row = { id: string; email: string; message_id: string | null; status: EmailEventStatus };
  const rows = (existing ?? []) as Row[];
  const byMessageId = new Map<string, Row>();
  const byEmail = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.message_id) byMessageId.set(row.message_id.replace(/[<>]/g, ""), row);
    const list = byEmail.get(row.email) ?? [];
    list.push(row);
    byEmail.set(row.email, list);
  }

  const suppress = new Map<string, SuppressionReason>();
  const inserts: Record<string, unknown>[] = [];
  const seenInsert = new Set<string>();

  for (const event of events) {
    const email = (event.email ?? "").trim().toLowerCase();
    const type = event.event ?? "";
    const status = STATUS_BY_EVENT[type];
    if (!email || !status) continue;

    const suppression = SUPPRESS_BY_EVENT[type];
    if (suppression) suppress.set(email, suppression);

    const messageId = (event.messageId ?? "").replace(/[<>]/g, "");
    const match = (messageId && byMessageId.get(messageId)) || byEmail.get(email)?.[0];

    if (match) {
      if ((RANK[status] ?? 0) <= (RANK[match.status] ?? 0)) continue;
      const { error: updateError } = await supabase
        .from("email_events")
        .update({
          status,
          reason: event.reason ?? null,
          updated_status_at: event.date ?? new Date().toISOString(),
          ...(messageId && !match.message_id ? { message_id: messageId } : {}),
        } as any)
        .eq("id", match.id);
      if (updateError) {
        console.error(`[brevo-sync] update falhou: ${updateError.message}`);
        continue;
      }
      match.status = status;
      summary.updated += 1;
      continue;
    }

    const key = messageId || `${email}-${event.date ?? ""}`;
    if (seenInsert.has(key)) continue;
    seenInsert.add(key);
    inserts.push({
      user_id: userId,
      campaign_id: null,
      email,
      message_id: messageId || null,
      status,
      reason: event.reason ?? null,
      sent_at: event.date ?? new Date().toISOString(),
      updated_status_at: event.date ?? new Date().toISOString(),
    });
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("email_events").insert(inserts as any);
    if (insertError) console.error(`[brevo-sync] insert falhou: ${insertError.message}`);
    else summary.inserted = inserts.length;
  }

  if (suppress.size > 0) {
    const rowsToBlock = [...suppress.entries()].map(([email, reason]) => ({
      user_id: userId,
      email,
      reason,
      source: "brevo-sync",
      detail: "Importado da API da Brevo",
    }));
    const { error: suppressError } = await supabase
      .from("suppressions")
      .upsert(rowsToBlock as any, { onConflict: "user_id,email" });
    if (suppressError) console.error(`[brevo-sync] supressão falhou: ${suppressError.message}`);
    else summary.suppressed = rowsToBlock.length;
  }

  return summary;
}
