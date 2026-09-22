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

/* ------------------------------------------------------------------ *
 * Plano de vários dias: dias da semana, pausa no meio da janela e
 * limite diário. Tudo calculado no fuso de São Paulo.
 * ------------------------------------------------------------------ */

const TZ = "America/Sao_Paulo";

type TzParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

function tzParts(date: Date, timeZone = TZ): TzParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"] === "24" ? "0" : parts["hour"]),
    minute: Number(parts["minute"]),
    weekday: weekdayMap[String(parts["weekday"])] ?? 0,
  };
}

/** Offset do fuso em minutos (ex.: -180 para BRT). */
function tzOffsetMinutes(date: Date, timeZone = TZ): number {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/** Converte uma data/hora local do fuso para o instante UTC correspondente. */
function zonedTimeToUtc(year: number, month: number, day: number, minutesOfDay: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, minutesOfDay));
  const offset = tzOffsetMinutes(guess);
  const exact = new Date(guess.getTime() - offset * 60_000);
  const offset2 = tzOffsetMinutes(exact);
  return offset2 === offset ? exact : new Date(guess.getTime() - offset2 * 60_000);
}

/** Data (AAAA-MM-DD) no fuso do Brasil — usada para o contador diário. */
export function brtDateKey(date = new Date()): string {
  const p = tzParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function allowedWeekday(schedule: SendSchedule, weekday: number): boolean {
  return schedule.weekdays.length === 0 || schedule.weekdays.includes(weekday);
}

function inPause(schedule: SendSchedule, current: number): boolean {
  if (!isTime(schedule.pauseStart) || !isTime(schedule.pauseEnd)) return false;
  const start = minutesOf(schedule.pauseStart);
  const end = minutesOf(schedule.pauseEnd);
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** Blocos permitidos do dia, em minutos desde a meia-noite. */
export function dayBlocks(schedule: SendSchedule): { start: number; end: number }[] {
  const start = minutesOf(schedule.startTime);
  const end = minutesOf(schedule.endTime);
  const window =
    start > end
      ? [
          { start, end: 24 * 60 },
          { start: 0, end },
        ]
      : [{ start, end }];
  if (!isTime(schedule.pauseStart) || !isTime(schedule.pauseEnd))
    return window.filter((b) => b.end > b.start);
  const ps = minutesOf(schedule.pauseStart);
  const pe = minutesOf(schedule.pauseEnd);
  const blocks: { start: number; end: number }[] = [];
  for (const block of window) {
    if (pe <= block.start || ps >= block.end) {
      blocks.push(block);
      continue;
    }
    if (ps > block.start) blocks.push({ start: block.start, end: ps });
    if (pe < block.end) blocks.push({ start: pe, end: block.end });
  }
  return blocks.filter((b) => b.end > b.start);
}

/** Pode enviar agora? (dia da semana + janela + pausa) */
export function isWithinPlanTz(schedule: SendSchedule, date = new Date()): boolean {
  if (!schedule.enabled) return true;
  const p = tzParts(date);
  if (!allowedWeekday(schedule, p.weekday)) return false;
  const current = p.hour * 60 + p.minute;
  if (inPause(schedule, current)) return false;
  return isWithinWindowTz(schedule, date);
}

/**
 * Próximo instante permitido a partir de `from`.
 * `skipToday` força pular o dia atual (ex.: cota diária estourada).
 */
export function nextSlotAt(schedule: SendSchedule, from = new Date(), skipToday = false): Date {
  if (!schedule.enabled) return from;
  if (!skipToday && isWithinPlanTz(schedule, from)) return from;
  const blocks = dayBlocks(schedule);
  if (blocks.length === 0) return new Date(from.getTime() + 60 * 60_000);

  const base = tzParts(from);
  const currentMinutes = base.hour * 60 + base.minute;
  for (let offset = skipToday ? 1 : 0; offset <= 14; offset += 1) {
    const dayStart = zonedTimeToUtc(base.year, base.month, base.day + offset, 0);
    const p = tzParts(dayStart);
    if (!allowedWeekday(schedule, p.weekday)) continue;
    for (const block of blocks) {
      if (offset === 0 && block.start <= currentMinutes) continue;
      return zonedTimeToUtc(base.year, base.month, base.day + offset, block.start);
    }
  }
  return new Date(from.getTime() + 24 * 60 * 60_000);
}

/** Quantos e-mails cabem por dia (janela, intervalo e limite diário). */
export function dailyCapacity(schedule: SendSchedule): number {
  if (!schedule.enabled) return Number.MAX_SAFE_INTEGER;
  const minutes = dayBlocks(schedule).reduce(
    (total, block) => total + (block.end - block.start),
    0,
  );
  const bySchedule = Math.floor((minutes * 60) / Math.max(1, schedule.intervalSeconds));
  return Math.max(0, Math.min(bySchedule, schedule.dailyLimit));
}

/** Resumo em português do plano de envio. */
export function describePlan(schedule: SendSchedule, pending: number): string {
  if (!schedule.enabled) return "Envio contínuo, 1 e-mail por segundo.";
  const perDay = dailyCapacity(schedule);
  if (perDay === 0) return "A janela escolhida não tem duração — nenhum e-mail seria enviado.";
  const days = Math.max(1, Math.ceil(pending / perDay));
  const dias =
    schedule.weekdays.length === 7
      ? "todos os dias"
      : schedule.weekdays.map((d) => WEEKDAY_LABELS[d]).join(", ");
  const pausa =
    isTime(schedule.pauseStart) && isTime(schedule.pauseEnd)
      ? ` (pausa das ${schedule.pauseStart} às ${schedule.pauseEnd})`
      : "";
  const finish = estimateFinish(schedule, pending);
  return `${dias}, das ${schedule.startTime} às ${schedule.endTime}${pausa}, 1 e-mail a cada ${schedule.intervalSeconds}s — até ${perDay} por dia. ${pending} e-mails levam cerca de ${days} dia(s) de envio${finish ? `, previsão de término em ${finish}` : ""}.`;
}

/** Data provável do último envio (dd/mm), considerando dias permitidos. */
export function estimateFinish(schedule: SendSchedule, pending: number, from = new Date()): string {
  if (!schedule.enabled || pending <= 0) return "";
  const perDay = dailyCapacity(schedule);
  if (perDay <= 0) return "";
  let remaining = pending;
  let cursor = nextSlotAt(schedule, from);
  for (let guard = 0; guard < 400 && remaining > 0; guard += 1) {
    remaining -= perDay;
    if (remaining <= 0) break;
    cursor = nextSlotAt(schedule, cursor, true);
  }
  return cursor.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}
