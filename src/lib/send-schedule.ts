/**
 * Agenda de envio: permite disparar só dentro de uma janela de horário
 * (ex.: das 09:00 às 18:00) e com um intervalo fixo entre cada e-mail.
 * Tudo roda no navegador, um e-mail por chamada ao servidor.
 */

export type SendSchedule = {
  /** Quando desligado, envia tudo de uma vez (1 e-mail/s no servidor). */
  enabled: boolean;
  /** "HH:MM" — início da janela. */
  startTime: string;
  /** "HH:MM" — fim da janela. */
  endTime: string;
  /** Intervalo entre e-mails, em segundos. */
  intervalSeconds: number;
};

export const DEFAULT_SCHEDULE: SendSchedule = {
  enabled: false,
  startTime: "09:00",
  endTime: "18:00",
  intervalSeconds: 30,
};

export function parseSchedule(value: unknown): SendSchedule {
  if (!value || typeof value !== "object") return { ...DEFAULT_SCHEDULE };
  const raw = value as Partial<SendSchedule>;
  return {
    enabled: Boolean(raw.enabled),
    startTime: isTime(raw.startTime) ? raw.startTime : DEFAULT_SCHEDULE.startTime,
    endTime: isTime(raw.endTime) ? raw.endTime : DEFAULT_SCHEDULE.endTime,
    intervalSeconds: clampInterval(Number(raw.intervalSeconds)),
  };
}

export function clampInterval(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCHEDULE.intervalSeconds;
  return Math.min(3600, Math.max(1, Math.round(value)));
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function minutesOf(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** Minutos desde a meia-noite do horário local agora. */
function nowMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function isWithinWindow(schedule: SendSchedule, date = new Date()): boolean {
  if (!schedule.enabled) return true;
  const start = minutesOf(schedule.startTime);
  const end = minutesOf(schedule.endTime);
  const current = nowMinutes(date);
  // Janela que atravessa a meia-noite (ex.: 22:00 → 06:00).
  if (start > end) return current >= start || current < end;
  return current >= start && current < end;
}

/** Milissegundos até a janela reabrir. */
export function msUntilWindow(schedule: SendSchedule, date = new Date()): number {
  if (isWithinWindow(schedule, date)) return 0;
  const start = minutesOf(schedule.startTime);
  const current = nowMinutes(date);
  const diff = start > current ? start - current : 24 * 60 - current + start;
  return diff * 60_000 - date.getSeconds() * 1000;
}

export function describeSchedule(schedule: SendSchedule, pending: number): string {
  if (!schedule.enabled) {
    return "Envio contínuo, 1 e-mail por segundo.";
  }
  const totalMinutes = Math.round((pending * schedule.intervalSeconds) / 60);
  return `Das ${schedule.startTime} às ${schedule.endTime}, 1 e-mail a cada ${schedule.intervalSeconds}s (~${totalMinutes} min para ${pending} e-mails).`;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera respeitando a janela; resolve false se o envio foi cancelado. */
export async function waitForWindow(
  schedule: SendSchedule,
  isCancelled: () => boolean,
  onWaiting?: (waiting: boolean) => void,
): Promise<boolean> {
  let notified = false;
  while (!isWithinWindow(schedule)) {
    if (isCancelled()) return false;
    if (!notified) {
      onWaiting?.(true);
      notified = true;
    }
    await sleep(Math.min(30_000, Math.max(1000, msUntilWindow(schedule))));
  }
  if (notified) onWaiting?.(false);
  return !isCancelled();
}
