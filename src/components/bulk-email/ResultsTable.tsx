import { CheckCircle, Download, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadFile, resultsToCsv, type SendResult } from "@/lib/bulk-email";

type ResultsTableProps = {
  results: SendResult[];
  retrying?: boolean;
  onRetryFailed?: () => void;
  onExportReport?: () => void;
};

export function ResultsTable({
  results,
  retrying,
  onRetryFailed,
  onExportReport,
}: ResultsTableProps) {
  const successCount = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          <span className="text-success">{successCount}</span> de {results.length} e-mails enviados
          com sucesso
          {failed.length > 0 && (
            <span className="text-destructive"> · {failed.length} com falha</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {failed.length > 0 && onRetryFailed && (
            <Button type="button" size="sm" disabled={retrying} onClick={onRetryFailed}>
              <RefreshCw className={`size-4 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Reenviando…" : `Reenviar ${failed.length} falhas`}
            </Button>
          )}
          {onExportReport && (
            <Button type="button" variant="outline" size="sm" onClick={onExportReport}>
              <Download className="size-4" />
              Relatório completo
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadFile(
                `log-envio-${new Date().toISOString().slice(0, 10)}.csv`,
                resultsToCsv(results),
              )
            }
          >
            <Download className="size-4" />
            Exportar log CSV
          </Button>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="border-destructive/40 bg-destructive/5 space-y-1 rounded-lg border p-3">
          <p className="text-destructive text-sm font-medium">Relatório de falhas</p>
          <ul className="text-muted-foreground space-y-0.5 text-xs">
            {failed.slice(0, 10).map((result, index) => (
              <li key={`${result.email}-${index}`} className="truncate">
                <span className="font-medium">{result.email}</span> —{" "}
                {result.error ?? "erro desconhecido"}
              </li>
            ))}
            {failed.length > 10 && <li>e mais {failed.length - 10}…</li>}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead>Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result, index) => (
              <TableRow key={`${result.email}-${index}`}>
                <TableCell className="font-medium">{result.email}</TableCell>
                <TableCell>
                  {result.success ? (
                    <Badge className="bg-success text-success-foreground gap-1">
                      <CheckCircle className="size-3.5" />
                      Enviado
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="size-3.5" />
                      Erro
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {result.error ?? result.messageId ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
