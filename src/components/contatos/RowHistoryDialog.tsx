import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CSV_ROW_STATUS_LABEL, type CsvRow } from "@/lib/csv-rows";
import { formatDateTime, type CsvRowEvent } from "@/lib/csv-row-events";

type Props = {
  row: CsvRow | null;
  events: CsvRowEvent[];
  onOpenChange: (open: boolean) => void;
};

export function RowHistoryDialog({ row, events, onOpenChange }: Props) {
  const rowEvents = row ? events.filter((event) => event.csv_row_id === row.id) : [];

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5" />
            Histórico de {row?.nome || row?.email}
          </DialogTitle>
          <DialogDescription>
            Cada mudança de status registrada para este destinatário.
          </DialogDescription>
        </DialogHeader>

        {rowEvents.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="space-y-3">
            {rowEvents.map((event) => (
              <li key={event.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {event.from_status ? CSV_ROW_STATUS_LABEL[event.from_status] : "—"} →{" "}
                    {CSV_ROW_STATUS_LABEL[event.to_status]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(event.created_at)}
                  </span>
                  {event.is_personalized !== null && (
                    <Badge variant={event.is_personalized ? "default" : "outline"}>
                      {event.is_personalized ? "Personalizado" : "Genérico"}
                    </Badge>
                  )}
                </div>
                {event.site_ok !== null && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Site: {event.site_ok ? "conteúdo válido" : `sem dados (${event.site_reason || "—"})`}
                  </p>
                )}
                {event.error_message && (
                  <p className="text-destructive mt-1 text-xs">Erro: {event.error_message}</p>
                )}
                {event.run_id && (
                  <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                    Execução {event.run_id.slice(0, 8)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
