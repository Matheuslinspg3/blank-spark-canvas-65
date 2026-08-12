import { Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { clampInterval, describeSchedule, type SendSchedule } from "@/lib/send-schedule";

type Props = {
  schedule: SendSchedule;
  pending: number;
  disabled?: boolean;
  onChange: (schedule: SendSchedule) => void;
};

/** Janela de horário + intervalo entre e-mails. */
export function ScheduleFields({ schedule, pending, disabled, onChange }: Props) {
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
          disabled={disabled}
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
              disabled={disabled}
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
              disabled={disabled}
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
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...schedule, intervalSeconds: clampInterval(Number(event.target.value)) })
              }
            />
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">{describeSchedule(schedule, pending)}</p>
    </div>
  );
}
