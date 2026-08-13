import { useServerFn } from "@tanstack/react-start";
import { Upload, FileText, Download, CheckCircle2, Users, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SAMPLE_CSV, downloadFile, parseCsv, type Recipient } from "@/lib/bulk-email";
import { importCsvRows, listCsvRows } from "@/lib/csv-rows.functions";
import type { CsvRow } from "@/lib/csv-rows";

const CONTACT_COLUMNS = ["nome", "email", "categoria", "ia_conteudo"];

function toRecipient(row: CsvRow): Recipient {
  return {
    nome: row.nome ?? "",
    email: row.email,
    categoria: row.categoria ?? "",
    ia_conteudo: row.generated_email ?? "",
  };
}

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
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [manual, setManual] = useState({ nome: "", email: "", categoria: "" });
  const fetchContacts = useServerFn(listCsvRows);
  const addContacts = useServerFn(importCsvRows);

  function mergeColumns(extra: string[]) {
    return Array.from(new Set([...(columns.length ? columns : CONTACT_COLUMNS), ...extra]));
  }

  async function useMyContacts() {
    setLoadingContacts(true);
    try {
      const rows = await fetchContacts();
      if (rows.length === 0) {
        toast.error("Você ainda não tem contatos salvos. Adicione um abaixo.");
        return;
      }
      setFileName("Minha lista de Contatos");
      setError(null);
      onLoaded(CONTACT_COLUMNS, rows.map(toRecipient));
      toast.success(`${rows.length} contatos carregados da sua lista`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar seus contatos.");
    } finally {
      setLoadingContacts(false);
    }
  }

  async function addManualContact() {
    const email = manual.email.trim().toLowerCase();
    if (!email.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setSavingContact(true);
    try {
      const saved = await addContacts({
        data: { rows: [{ nome: manual.nome.trim(), email, categoria: manual.categoria.trim() }] },
      });
      const added = (saved ?? []).map(toRecipient);
      onLoaded(mergeColumns(CONTACT_COLUMNS), [...recipients, ...added]);
      setManual({ nome: "", email: "", categoria: "" });
      toast.success("Contato adicionado à lista e ao disparo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o contato.");
    } finally {
      setSavingContact(false);
    }
  }


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
          variant="secondary"
          disabled={disabled || loadingContacts}
          onClick={() => void useMyContacts()}
        >
          <Users className="size-4" />
          {loadingContacts ? "Carregando…" : "Usar minha lista de Contatos"}
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

          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((row, index) => (
                  <TableRow key={`${row['email']}-${index}`}>
                    {columns.map((column) => (
                      <TableCell key={column} className="max-w-md whitespace-pre-wrap">
                        {row[column]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground text-xs">
            Mostrando {recipients.length} linhas do CSV.
          </p>

        </div>
      )}
    </div>
  );
}
