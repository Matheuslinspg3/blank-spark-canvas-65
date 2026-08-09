import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Download,
  Loader2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { callAi, isAiConfigured, loadAiSettings } from "@/lib/ai-config";
import { downloadFile, parseCsv } from "@/lib/bulk-email";
import {
  CSV_ROW_STATUS_LABEL,
  EMAIL_WRITER_SYSTEM_PROMPT,
  SAMPLE_CONTACTS_CSV,
  buildGenericPrompt,
  buildPersonalizedPrompt,
  domainFromEmail,
  isTrustworthyContent,
  type CsvRow,
  type CsvRowStatus,
} from "@/lib/csv-rows";
import {
  deleteCsvRow,
  fetchSiteText,
  importCsvRows,
  listCsvRows,
  updateCsvRow,
} from "@/lib/csv-rows.functions";

export const Route = createFileRoute("/_authenticated/contatos")({
  head: () => ({
    meta: [
      { title: "Contatos e geração com IA — Disparo Tracker" },
      {
        name: "description",
        content:
          "Importe seu CSV de contatos, acompanhe o processamento e gere e-mails personalizados com IA a partir do site de cada empresa.",
      },
      { property: "og:title", content: "Contatos e geração com IA — Disparo Tracker" },
      {
        property: "og:description",
        content: "Upload de CSV, processamento em lote e geração de e-mails com IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContatosPage,
});

function statusVariant(status: CsvRowStatus) {
  if (status === "gerado") return "default" as const;
  if (status === "erro") return "destructive" as const;
  return "secondary" as const;
}

function ContatosPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const fetchRows = useServerFn(listCsvRows);
  const importRows = useServerFn(importCsvRows);
  const updateRow = useServerFn(updateCsvRow);
  const removeRow = useServerFn(deleteCsvRow);
  const scrapeSite = useServerFn(fetchSiteText);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["csv-rows"],
    queryFn: () => fetchRows(),
  });

  const counts = {
    pendente: rows.filter((r) => r.status === "pendente").length,
    processando: rows.filter((r) => r.status === "processando").length,
    gerado: rows.filter((r) => r.status === "gerado").length,
    erro: rows.filter((r) => r.status === "erro").length,
  };

  const importMutation = useMutation({
    mutationFn: (payload: { nome: string; email: string; categoria: string }[]) =>
      importRows({ data: { rows: payload } }),
    onSuccess: (inserted) => {
      void queryClient.invalidateQueries({ queryKey: ["csv-rows"] });
      toast.success(`${inserted.length} contatos importados`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeRow({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["csv-rows"] }),
  });

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      const { rows: parsed } = parseCsv(text);
      importMutation.mutate(
        parsed.map((row) => ({
          nome: row["nome"] ?? "",
          email: row["email"] ?? "",
          categoria: row["categoria"] ?? "",
        })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV inválido");
    }
  }

  /** Processa uma linha: busca o site, valida e gera o e-mail com a IA. */
  async function processRow(row: CsvRow) {
    const settings = loadAiSettings();
    await updateRow({ data: { id: row.id, patch: { status: "processando" } } });

    let siteContent: string | null = null;
    const domain = domainFromEmail(row.email);
    if (domain) {
      try {
        const result = await scrapeSite({ data: { domain } });
        if (result.ok && isTrustworthyContent(result.text)) siteContent = result.text;
      } catch {
        siteContent = null;
      }
    }

    const personalized = siteContent !== null;
    const validContent = siteContent ?? "";
    const prompt = personalized
      ? buildPersonalizedPrompt({ nome: row.nome, categoria: row.categoria, siteContent: validContent })
      : buildGenericPrompt({ nome: row.nome, categoria: row.categoria });

    try {
      const content = await callAi(settings, prompt, EMAIL_WRITER_SYSTEM_PROMPT);
      await updateRow({
        data: {
          id: row.id,
          patch: {
            status: "gerado",
            site_content: siteContent,
            generated_email: content,
            is_personalized: personalized,
            error_message: null,
          },
        },
      });
    } catch (error) {
      await updateRow({
        data: {
          id: row.id,
          patch: {
            status: "erro",
            site_content: siteContent,
            error_message: error instanceof Error ? error.message : "Falha na IA",
          },
        },
      });
    }
  }

  async function handleProcess() {
    if (!isAiConfigured(loadAiSettings())) {
      toast.error("Configure a base URL e a API key da IA em /configuracoes.");
      return;
    }
    const pending = rows.filter((r) => r.status === "pendente" || r.status === "erro");
    if (pending.length === 0) {
      toast.info("Nenhuma linha pendente.");
      return;
    }

    stopRef.current = false;
    setProcessing(true);
    setProgress({ done: 0, total: pending.length });

    let cursor = 0;
    const next = () => (cursor < pending.length ? cursor++ : -1);

    const worker = async () => {
      for (let i = next(); i !== -1; i = next()) {
        if (stopRef.current) return;
        // Uma linha com erro nunca interrompe o lote.
        await processRow(pending[i]!).catch(() => undefined);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };

    await Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker));
    await queryClient.invalidateQueries({ queryKey: ["csv-rows"] });
    setProcessing(false);
    toast.success("Processamento finalizado");
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="text-primary size-6" />
            Contatos
          </h1>
          <p className="text-muted-foreground text-sm">
            Importe o CSV (nome, email, categoria) e gere um e-mail para cada contato com IA.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/revisao">Revisar e aprovar</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/configuracoes">Configurar IA</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload do CSV</CardTitle>
          <CardDescription>Colunas esperadas: nome, email, categoria.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <Button disabled={importMutation.isPending} onClick={() => inputRef.current?.click()}>
            {importMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Importar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadFile("exemplo-contatos.csv", SAMPLE_CONTACTS_CSV)}
          >
            <Download className="size-4" />
            CSV de exemplo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Geração com IA</CardTitle>
          <CardDescription>
            Busca o site do domínio do e-mail (5s de timeout) e escreve o texto; sem site válido, o
            e-mail é genérico.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Pendentes: {counts.pendente}</Badge>
            <Badge variant="secondary">Processando: {counts.processando}</Badge>
            <Badge>Gerados: {counts.gerado}</Badge>
            <Badge variant="destructive">Erros: {counts.erro}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={processing || rows.length === 0} onClick={() => void handleProcess()}>
              {processing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {processing
                ? `Processando ${progress.done}/${progress.total}…`
                : "Processar pendentes"}
            </Button>
            {processing && (
              <Button
                variant="destructive"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                Parar
              </Button>
            )}
          </div>
          {processing && (
            <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de contatos</CardTitle>
          <CardDescription>{rows.length} contatos importados.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum contato importado ainda.</p>
          ) : (
            <div className="max-h-[32rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.nome || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email}</TableCell>
                      <TableCell className="text-muted-foreground">{row.categoria || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusVariant(row.status)}>
                            {CSV_ROW_STATUS_LABEL[row.status]}
                          </Badge>
                          {row.status === "gerado" &&
                            (row.is_personalized ? (
                              <CheckCircle2 className="size-3.5 text-emerald-500" />
                            ) : (
                              <TriangleAlert className="size-3.5 text-amber-500" />
                            ))}
                        </div>
                        {row.error_message && (
                          <p className="text-destructive mt-1 text-xs">{row.error_message}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(row.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
