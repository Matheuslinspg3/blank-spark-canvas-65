import type { ChatMessage } from "./ai-chat-dispatch";
import type { Recipient, Reviews, SendResult } from "./bulk-email";
import type { SendSchedule } from "./send-schedule";

export type QueuedMessage = { email: string; subject: string; html: string };

export type CampaignStatus = "rascunho" | "agendado" | "enviando" | "concluido" | "erro";

/** "completo" = 5 etapas; "simples" = IA; "molde" = textos próprios; "ia" = chat. */
export type CampaignMode = "completo" | "simples" | "molde" | "ia";

export type Campaign = {
  id: string;
  user_id: string;
  name: string;
  status: CampaignStatus;
  mode: CampaignMode;
  brief: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  html_template: string;
  recipients: Recipient[];
  results: SendResult[];
  reviews: Reviews;
  chat: ChatMessage[];
  total_count: number;
  sent_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  schedule: SendSchedule | null;
  queue: QueuedMessage[];
  next_send_at: string | null;
  marketing_campaign_id: string | null;
  /** Disparo pausado pelo usuário (fila preservada). */
  paused?: boolean | null;
  /** Quantos e-mails saíram no dia corrente e a data desse contador. */
  daily_sent_count?: number | null;
  daily_sent_date?: string | null;
};

export type CampaignPatch = Partial<
  Pick<
    Campaign,
    | "name"
    | "status"
    | "brief"
    | "sender_name"
    | "sender_email"
    | "subject"
    | "html_template"
    | "recipients"
    | "results"
    | "reviews"
    | "chat"
    | "total_count"
    | "sent_count"
    | "started_at"
    | "finished_at"
  >
>;

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  rascunho: "Rascunho",
  agendado: "Programado",
  enviando: "Enviando",
  concluido: "Concluído",
  erro: "Erro",
};
