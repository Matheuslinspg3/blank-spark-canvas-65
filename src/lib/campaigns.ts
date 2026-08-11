import type { Recipient, Reviews, SendResult } from "./bulk-email";

export type CampaignStatus = "rascunho" | "enviando" | "concluido" | "erro";

/** "completo" = fluxo de 5 etapas; "simples" = disparo rápido com IA. */
export type CampaignMode = "completo" | "simples";

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
  total_count: number;
  sent_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
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
    | "total_count"
    | "sent_count"
    | "started_at"
    | "finished_at"
  >
>;

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  rascunho: "Rascunho",
  enviando: "Enviando",
  concluido: "Concluído",
  erro: "Erro",
};
