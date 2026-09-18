import { CalendarCheck2, CalendarClock, Clock, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { clampInterval, describeSchedule, type SendSchedule } from "@/lib/send-schedule";

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
}: Props) {
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
                onChange({ ...schedule, intervalSeconds: clampInterval(Number(event.target.value)) })
              }
            />
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">{describeSchedule(schedule, pending)}</p>

      {schedule.enabled && !scheduled && onSchedule && (
        <div className="space-y-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            disabled={disabled || scheduling || pending === 0}
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
