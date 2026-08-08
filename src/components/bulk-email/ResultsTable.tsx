import { CheckCircle, Download, XCircle } from "lucide-react";

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

export function ResultsTable({ results }: { results: SendResult[] }) {
  const successCount = results.filter((r) => r.success).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          <span className="text-success">{successCount}</span> de {results.length} e-mails enviados
          com sucesso
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadFile(`log-envio-${new Date().toISOString().slice(0, 10)}.csv`, resultsToCsv(results))
          }
        >
          <Download className="size-4" />
          Exportar log CSV
        </Button>
      </div>

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
