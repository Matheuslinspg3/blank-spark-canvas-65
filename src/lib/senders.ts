/**
 * Remetentes verificados na Brevo. Ficam salvos no navegador e, quando a lista
 * existe, o disparo só permite escolher um deles (evita erro de "sender not
 * valid" por digitação).
 */

export type Sender = { name: string; email: string };

export type SendersConfig = {
  list: Sender[];
  defaultEmail: string;
};

export const SENDERS_KEY = "bulk-email:senders";

export const EMPTY_SENDERS: SendersConfig = { list: [], defaultEmail: "" };

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function loadSenders(): SendersConfig {
  if (typeof window === "undefined") return EMPTY_SENDERS;
  try {
    const raw = localStorage.getItem(SENDERS_KEY);
    if (!raw) return EMPTY_SENDERS;
    const parsed = JSON.parse(raw) as Partial<SendersConfig>;
    const list = (parsed.list ?? []).filter((s) => s && isValidEmail(s.email ?? ""));
    return { list, defaultEmail: parsed.defaultEmail ?? list[0]?.email ?? "" };
  } catch {
    return EMPTY_SENDERS;
  }
}

export function saveSenders(config: SendersConfig) {
  localStorage.setItem(SENDERS_KEY, JSON.stringify(config));
}

export function clearSenders() {
  localStorage.removeItem(SENDERS_KEY);
}

/** Remetente padrão (o pré-selecionado em todo disparo/teste). */
export function defaultSender(config: SendersConfig): Sender | undefined {
  return config.list.find((s) => s.email === config.defaultEmail) ?? config.list[0];
}
