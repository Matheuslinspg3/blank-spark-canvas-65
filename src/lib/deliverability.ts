/**
 * Entregabilidade: métricas por campanha, limite diário de envio e as
 * recomendações automáticas mostradas no relatório. Sem dependência de
 * framework para ficar fácil de testar.
 */

export type EmailEventStatus =
  | "enviado"
  | "entregue"
  | "bounce_hard"
  | "bounce_soft"
  | "spam"
  | "bloqueado"
  | "invalido"
  | "erro";

export type SuppressionReason = "bounce" | "spam" | "invalido" | "manual";

export type EmailEvent = {
  id: string;
  campaign_id: string | null;
  email: string;
  message_id: string | null;
  status: EmailEventStatus;
  reason: string | null;
  sent_at: string;
  updated_status_at: string | null;
};

export type Suppression = {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: string;
  detail: string | null;
  created_at: string;
};

export const EVENT_LABEL: Record<EmailEventStatus, string> = {
  enviado: "Enviado",
  entregue: "Entregue",
  bounce_hard: "Bounce definitivo",
  bounce_soft: "Bounce temporário",
  spam: "Marcado como spam",
  bloqueado: "Bloqueado",
  invalido: "Endereço inválido",
  erro: "Erro no envio",
};

export const SUPPRESSION_LABEL: Record<SuppressionReason, string> = {
  bounce: "Bounce",
  spam: "Reclamação de spam",
  invalido: "Endereço inválido",
  manual: "Bloqueio manual",
};

/* -------------------------------------------------------------------------- */
/* Limite diário                                                               */
/* -------------------------------------------------------------------------- */

export type SendLimits = {
  /** Máximo de e-mails enviados em 24h por este usuário. */
  dailyLimit: number;
};

export const DEFAULT_LIMITS: SendLimits = { dailyLimit: 200 };
export const LIMITS_KEY = "bulk-email:limits";
/** Acima deste percentual do limite o app avisa antes de estourar. */
export const LIMIT_WARN_RATIO = 0.8;

export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMITS.dailyLimit;
  return Math.min(20000, Math.max(1, Math.round(value)));
}

export function loadLimits(): SendLimits {
  if (typeof window === "undefined") return { ...DEFAULT_LIMITS };
  try {
    const raw = localStorage.getItem(LIMITS_KEY);
    if (!raw) return { ...DEFAULT_LIMITS };
    const parsed = JSON.parse(raw) as Partial<SendLimits>;
    return { dailyLimit: clampLimit(Number(parsed.dailyLimit)) };
  } catch {
    return { ...DEFAULT_LIMITS };
  }
}

export function saveLimits(limits: SendLimits) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify({ dailyLimit: clampLimit(limits.dailyLimit) }));
}

/* -------------------------------------------------------------------------- */
/* Métricas                                                                    */
/* -------------------------------------------------------------------------- */

export type DeliverabilityMetrics = {
  total: number;
  entregues: number;
  bounceHard: number;
  bounceSoft: number;
  spam: number;
  erros: number;
  pendentes: number;
  /** Percentuais de 0 a 100. */
  bounceRate: number;
  spamRate: number;
  deliveryRate: number;
};

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function computeMetrics(events: EmailEvent[]): DeliverabilityMetrics {
  const total = events.length;
  const count = (status: EmailEventStatus) => events.filter((e) => e.status === status).length;

  const bounceHard = count("bounce_hard") + count("invalido") + count("bloqueado");
  const bounceSoft = count("bounce_soft");
  const spam = count("spam");
  const erros = count("erro");
  const entregues = count("entregue");
  const pendentes = count("enviado");

  return {
    total,
    entregues,
    bounceHard,
    bounceSoft,
    spam,
    erros,
    pendentes,
    bounceRate: pct(bounceHard + bounceSoft, total),
    spamRate: pct(spam, total),
    deliveryRate: pct(entregues, total),
  };
}

/** Limites de segurança: acima disso a campanha é interrompida. */
export const BOUNCE_RATE_LIMIT = 5;
export const SPAM_RATE_LIMIT = 0.3;
/** Só vale a pena avaliar taxas com um mínimo de envios. */
export const MIN_SAMPLE_FOR_RATES = 20;

export type RiskAlert = { level: "critico" | "atencao"; message: string };

/** Alertas de reputação; nível "critico" para o app parar o disparo sozinho. */
export function riskAlerts(metrics: DeliverabilityMetrics): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  if (metrics.total < MIN_SAMPLE_FOR_RATES) return alerts;

  if (metrics.spamRate >= SPAM_RATE_LIMIT) {
    alerts.push({
      level: "critico",
      message: `Taxa de reclamação de spam em ${metrics.spamRate}% (limite seguro: ${SPAM_RATE_LIMIT}%). Pare o disparo e revise assunto, lista e frequência.`,
    });
  } else if (metrics.spamRate > 0) {
    alerts.push({
      level: "atencao",
      message: `Já houve ${metrics.spam} reclamação(ões) de spam nesta campanha. Fique de olho.`,
    });
  }

  if (metrics.bounceRate >= BOUNCE_RATE_LIMIT) {
    alerts.push({
      level: "critico",
      message: `Taxa de bounce em ${metrics.bounceRate}% (limite seguro: ${BOUNCE_RATE_LIMIT}%). A lista tem muitos endereços inválidos — limpe antes de continuar.`,
    });
  } else if (metrics.bounceRate > 2) {
    alerts.push({
      level: "atencao",
      message: `Taxa de bounce em ${metrics.bounceRate}%. Acima de ${BOUNCE_RATE_LIMIT}% o disparo é interrompido automaticamente.`,
    });
  }

  return alerts;
}

export function shouldStopCampaign(metrics: DeliverabilityMetrics): boolean {
  return riskAlerts(metrics).some((alert) => alert.level === "critico");
}

/** Recomendações práticas geradas a partir dos números da campanha. */
export function recommendations(metrics: DeliverabilityMetrics): string[] {
  const tips: string[] = [];

  if (metrics.total === 0) {
    return ["Envie a campanha para começar a coletar dados de entregabilidade."];
  }

  if (metrics.bounceHard > 0) {
    tips.push(
      `${metrics.bounceHard} endereço(s) não existem e já foram bloqueados automaticamente. Peça listas mais recentes e evite comprar bases.`,
    );
  }
  if (metrics.bounceRate >= BOUNCE_RATE_LIMIT) {
    tips.push(
      "Reduza o volume diário pela metade por alguns dias e valide os endereços antes do próximo disparo — bounce alto derruba a reputação do domínio.",
    );
  }
  if (metrics.spam > 0) {
    tips.push(
      "Houve reclamação de spam: deixe claro no primeiro parágrafo por que você está escrevendo e ofereça uma saída simples (“responda com 'sair' que não escrevo mais”).",
    );
  }
  if (metrics.deliveryRate > 0 && metrics.deliveryRate < 90) {
    tips.push(
      "Entrega abaixo de 90%: confirme SPF, DKIM e DMARC do domínio remetente no painel da Brevo.",
    );
  }
  if (metrics.pendentes > metrics.entregues && metrics.pendentes > 5) {
    tips.push(
      "Muitos envios ainda sem confirmação: verifique se o webhook da Brevo está configurado em Configurações para receber entregas e bounces.",
    );
  }
  if (metrics.erros > 0) {
    tips.push(
      `${metrics.erros} envio(s) falharam antes de sair. Confira o remetente verificado e o formato dos endereços.`,
    );
  }
  if (metrics.total > 100) {
    tips.push(
      "Volumes acima de 100 e-mails por dia pedem aquecimento: aumente aos poucos e use a janela de horário com intervalo entre os envios.",
    );
  }
  if (tips.length === 0) {
    tips.push("Nenhum problema detectado. Mantenha o volume estável e continue monitorando.");
  }
  return tips;
}

/** CSV do relatório de entregabilidade. */
export function eventsToCsv(events: EmailEvent[]): string {
  const cell = (value: string) => `"${(value ?? "").replace(/"/g, '""')}"`;
  const lines = events.map((event) =>
    [
      cell(event.email),
      cell(EVENT_LABEL[event.status]),
      cell(event.reason ?? ""),
      cell(new Date(event.sent_at).toLocaleString("pt-BR")),
      cell(
        event.updated_status_at ? new Date(event.updated_status_at).toLocaleString("pt-BR") : "",
      ),
      cell(event.message_id ?? ""),
    ].join(","),
  );
  return ["email,status,motivo,enviado_em,atualizado_em,message_id", ...lines].join("\n");
}
