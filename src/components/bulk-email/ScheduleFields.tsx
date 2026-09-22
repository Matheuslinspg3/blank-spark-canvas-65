import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  addMinutes,
  clampDailyLimit,
  clampInterval,
  dailyCapacity,
  describePlan,
  WEEKDAY_LABELS,
  windowWarning,
  type SendSchedule,
} from "@/lib/send-schedule";
import { hasTrackableLink, NO_LINK_MESSAGE } from "@/lib/trackable-link";

type Props = {
  schedule: SendSchedule;
  pending: number;
  disabled?: boolean;
  onChange: (schedule: SendSchedule) => void;
  /** Grava a fila no servidor para o robô enviar no horário. */
  onSchedule?: () => void;
  scheduling?: boolean;
  /** Campanha já programada no servidor. */
  scheduled?: boolean;
  nextSendAt?: string | null;
  onCancelSchedule?: () => void;
  cancelling?: boolean;
  /** Conteúdo do e-mail para conferir se existe link rastreável. */
  contentToCheck?: (string | null | undefined)[];
};

/** Janela de horário + intervalo entre e-mails, com salvamento no servidor. */
export function ScheduleFields({
  schedule,
  pending,
  disabled,
  onChange,
  onSchedule,
  scheduling,
  scheduled,
  nextSendAt,
  onCancelSchedule,
  cancelling,
  contentToCheck,
}: Props) {
  const perDay = dailyCapacity(schedule);
  const spansDays = schedule.enabled && pending > perDay;
  const warning = spansDays ? null : windowWarning(schedule, pending);
  const linkChecked = Array.isArray(contentToCheck) && contentToCheck.some((item) => Boolean(item));
  const missingLink = linkChecked && !hasTrackableLink(...contentToCheck!);

  const toggleWeekday = (day: number) => {
    const next = schedule.weekdays.includes(day)
      ? schedule.weekdays.filter((item) => item !== day)
      : [...schedule.weekdays, day].sort();
    onChange({ ...schedule, weekdays: next });
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="agenda" className="flex items-center gap-2 text-sm font-medium">
          <Clock className="text-primary size-4" />
          Disparar em horário definido
        </Label>
        <Switch
          id="agenda"
          checked={schedule.enabled}
          disabled={disabled || scheduled}
          onCheckedChange={(enabled) => onChange({ ...schedule, enabled })}
        />
      </div>

      {schedule.enabled && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="agenda-inicio" className="text-xs">
              Das
            </Label>
            <Input
              id="agenda-inicio"
              type="time"
              className="h-9 w-[120px]"
              value={schedule.startTime}
              disabled={disabled || scheduled}
              onChange={(event) => onChange({ ...schedule, startTime: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agenda-fim" className="text-xs">
              Até
            </Label>
            <Input
              id="agenda-fim"
              type="time"
              className="h-9 w-[120px]"
              value={schedule.endTime}
              disabled={disabled || scheduled}
              onChange={(event) => onChange({ ...schedule, endTime: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agenda-intervalo" className="text-xs">
              Intervalo (segundos)
            </Label>
            <Input
              id="agenda-intervalo"
              type="number"
              min={1}
              max={3600}
              className="h-9 w-[140px]"
              value={schedule.intervalSeconds}
              disabled={disabled || scheduled}
              onChange={(event) =>
                onChange({
                  ...schedule,
                  intervalSeconds: clampInterval(Number(event.target.value)),
                })
              }
            />
          </div>
        </div>
      )}

      {schedule.enabled && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Dias em que pode enviar</Label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_LABELS.map((label, day) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={schedule.weekdays.includes(day) ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  disabled={disabled || scheduled}
                  onClick={() => toggleWeekday(day)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="agenda-pausa-inicio" className="text-xs">
                Pausa das
              </Label>
              <Input
                id="agenda-pausa-inicio"
                type="time"
                className="h-9 w-[120px]"
                value={schedule.pauseStart}
                disabled={disabled || scheduled}
                onChange={(event) => onChange({ ...schedule, pauseStart: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agenda-pausa-fim" className="text-xs">
                Pausa até
              </Label>
              <Input
                id="agenda-pausa-fim"
                type="time"
                className="h-9 w-[120px]"
                value={schedule.pauseEnd}
                disabled={disabled || scheduled}
                onChange={(event) => onChange({ ...schedule, pauseEnd: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agenda-limite" className="text-xs">
                Máximo por dia
              </Label>
              <Input
                id="agenda-limite"
                type="number"
                min={1}
                max={5000}
                className="h-9 w-[140px]"
                value={schedule.dailyLimit}
                disabled={disabled || scheduled}
                onChange={(event) =>
                  onChange({ ...schedule, dailyLimit: clampDailyLimit(Number(event.target.value)) })
                }
              />
            </div>
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">{describePlan(schedule, pending)}</p>

      {schedule.enabled && spansDays && (
        <Badge variant="secondary" className="text-xs">
          Envio dividido em vários dias — o robô continua sozinho de onde parou.
        </Badge>
      )}

      {missingLink && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{NO_LINK_MESSAGE}</p>
        </div>
      )}

      {warning && !scheduled && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-2">
            <p>{warning.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={disabled || scheduled}
              onClick={() =>
                onChange({
                  ...schedule,
                  endTime: addMinutes(schedule.startTime, warning.minutesNeeded + 5),
                })
              }
            >
              Ajustar horário final para {addMinutes(schedule.startTime, warning.minutesNeeded + 5)}
            </Button>
          </div>
        </div>
      )}

      {schedule.enabled && !scheduled && onSchedule && (
        <div className="space-y-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            disabled={
              disabled || scheduling || pending === 0 || warning?.capacity === 0 || missingLink
            }
            onClick={onSchedule}
          >
            {scheduling ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarClock className="size-4" />
            )}
            {scheduling ? "Programando…" : `Salvar e programar ${pending} e-mails`}
          </Button>
          <p className="text-muted-foreground text-xs">
            Clique aqui para guardar o horário: o envio passa a ser feito pelo servidor, mesmo com o
            site fechado. Sem clicar, nada fica programado.
          </p>
        </div>
      )}

      {scheduled && (
        <div className="space-y-2 border-t pt-3">
          <p className="flex items-center gap-2 text-xs font-medium text-emerald-600">
            <CalendarCheck2 className="size-4" />
            Programado no servidor
            {nextSendAt
              ? ` · próximo envio ${new Date(nextSendAt).toLocaleString("pt-BR")}`
              : " · começa assim que a janela abrir"}
          </p>
          {onCancelSchedule && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={onCancelSchedule}
            >
              <XCircle className="size-4" />
              {cancelling ? "Cancelando…" : "Cancelar agendamento"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
