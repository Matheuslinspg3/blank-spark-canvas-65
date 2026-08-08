import { Upload, FileText, Download, CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { SAMPLE_CSV, downloadFile, parseCsv, type Recipient } from "@/lib/bulk-email";

type CSVUploaderProps = {
  recipients: Recipient[];
  columns: string[];
  disabled: boolean;
  onLoaded: (columns: string[], rows: Recipient[]) => void;
};

export function CSVUploader({ recipients, columns, disabled, onLoaded }: CSVUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      const { columns: cols, rows } = parseCsv(text);
      setFileName(file.name);
      setError(null);
      onLoaded(cols, rows);
      toast.success(`${rows.length} destinatários carregados`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível ler o CSV.";
      setError(message);
      setFileName(null);
      onLoaded([], []);
      toast.error(message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <Button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          Selecionar arquivo CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadFile("exemplo-destinatarios.csv", SAMPLE_CSV)}
        >
          <Download className="size-4" />
          Baixar CSV de exemplo
        </Button>
        {fileName && (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <FileText className="size-4" />
            {fileName}
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {recipients.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-success text-success-foreground gap-1">
              <CheckCircle2 className="size-3.5" />
              {recipients.length} destinatários
            </Badge>
            {columns.map((column) => (
              <Badge key={column} variant="secondary" className="font-mono text-xs">
                {`{{${column}}}`}
              </Badge>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.slice(0, 3).map((row, index) => (
                  <TableRow key={`${row['email']}-${index}`}>
                    {columns.map((column) => (
                      <TableCell key={column} className="whitespace-nowrap">
                        {row[column]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground text-xs">
            Mostrando as 3 primeiras linhas de {recipients.length}.
          </p>
        </div>
      )}
    </div>
  );
}
