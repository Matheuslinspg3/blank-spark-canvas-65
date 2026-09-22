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
  /** Dias da semana permitidos (0 = domingo … 6 = sábado). */
  weekdays: number[];
  /** Pausa dentro da janela (ex.: almoço). "HH:MM" ou vazio. */
  pauseStart: string;
  pauseEnd: string;
  /** Máximo de e-mails por dia. */
  dailyLimit: number;
};

export const DEFAULT_SCHEDULE: SendSchedule = {
  enabled: false,
  startTime: "09:00",
  endTime: "18:00",
  intervalSeconds: 30,
  weekdays: [1, 2, 3, 4, 5],
  pauseStart: "",
  pauseEnd: "",
  dailyLimit: 200,
};

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function parseSchedule(value: unknown): SendSchedule {
  if (!value || typeof value !== "object") return { ...DEFAULT_SCHEDULE };
  const raw = value as Partial<SendSchedule>;
  const weekdays = Array.isArray(raw.weekdays)
    ? raw.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  return {
    enabled: Boolean(raw.enabled),
    startTime: isTime(raw.startTime) ? raw.startTime : DEFAULT_SCHEDULE.startTime,
    endTime: isTime(raw.endTime) ? raw.endTime : DEFAULT_SCHEDULE.endTime,
    intervalSeconds: clampInterval(Number(raw.intervalSeconds)),
    weekdays: weekdays.length > 0 ? [...new Set(weekdays)].sort() : [...DEFAULT_SCHEDULE.weekdays],
    pauseStart: isTime(raw.pauseStart) ? raw.pauseStart : "",
    pauseEnd: isTime(raw.pauseEnd) ? raw.pauseEnd : "",
    dailyLimit: clampDailyLimit(Number(raw.dailyLimit)),
  };
}

export function clampDailyLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SCHEDULE.dailyLimit;
  return Math.min(5000, Math.max(1, Math.round(value)));
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

/** Duração da janela em minutos (considera janelas que viram a meia-noite). */
export function windowMinutes(schedule: SendSchedule): number {
  const start = minutesOf(schedule.startTime);
  const end = minutesOf(schedule.endTime);
  if (start === end) return 0;
  return start > end ? 24 * 60 - start + end : end - start;
}

/** Quantos e-mails cabem na janela com o intervalo escolhido. */
export function windowCapacity(schedule: SendSchedule): number {
  const seconds = windowMinutes(schedule) * 60;
  if (seconds <= 0) return 0;
  return Math.floor(seconds / Math.max(1, schedule.intervalSeconds)) + 1;
}

/**
 * Aviso quando a janela de horário é curta demais para a quantidade de e-mails:
 * o robô envia só o que couber e o resto fica parado até o dia seguinte.
 */
export function windowWarning(
  schedule: SendSchedule,
  pending: number,
): { capacity: number; leftovers: number; minutesNeeded: number; message: string } | null {
  if (!schedule.enabled || pending <= 0) return null;
  const capacity = windowCapacity(schedule);
  if (capacity >= pending) return null;

  const leftovers = pending - capacity;
  const minutesNeeded = Math.max(1, Math.ceil(((pending - 1) * schedule.intervalSeconds) / 60));

  if (capacity === 0) {
    return {
      capacity,
      leftovers,
      minutesNeeded,
      message: `A janela das ${schedule.startTime} às ${schedule.endTime} não tem duração nenhuma — nenhum e-mail será enviado. Aumente o horário final para pelo menos ${minutesNeeded} min depois do inicial.`,
    };
  }

  return {
    capacity,
    leftovers,
    minutesNeeded,
    message: `Nesse horário só cabem ${capacity} de ${pending} e-mails: os outros ${leftovers} ficam parados esperando a janela abrir de novo (amanhã). Para enviar todos hoje, deixe a janela com pelo menos ${minutesNeeded} min (ex.: das ${schedule.startTime} às ${addMinutes(schedule.startTime, minutesNeeded)}) ou diminua o intervalo.`,
  };
}

/** Soma minutos a um horário "HH:MM". */
export function addMinutes(time: string, minutes: number): string {
  const total = (minutesOf(time) + minutes) % (24 * 60);
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
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

/** Minutos desde a meia-noite em um fuso específico (padrão: São Paulo). */
export function minutesInTimeZone(date = new Date(), timeZone = "America/Sao_Paulo"): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Versão da janela usada no servidor, sempre no fuso do usuário (Brasil). */
export function isWithinWindowTz(
  schedule: SendSchedule,
  date = new Date(),
  timeZone = "America/Sao_Paulo",
): boolean {
  if (!schedule.enabled) return true;
  const start = minutesOf(schedule.startTime);
  const end = minutesOf(schedule.endTime);
  const current = minutesInTimeZone(date, timeZone);
  if (start > end) return current >= start || current < end;
  return current >= start && current < end;
}
