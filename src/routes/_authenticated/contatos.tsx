import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  CheckCircle2,
  Download,
  History,
  Loader2,
  RefreshCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  Users,

} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { RowFilters } from "@/components/contatos/RowFilters";
import { RowHistoryDialog } from "@/components/contatos/RowHistoryDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  RESEARCH_SYSTEM_PROMPT,
  buildResearchPrompt,
  isUsefulDossier,
  parseDossier,
  type CompanyDossier,
  type ResearchSource,
} from "@/lib/company-research";
import { researchCompany } from "@/lib/company-research.functions";
import { formatDateTime, summarizeRuns, type CsvRowEventInput } from "@/lib/csv-row-events";
import {
  CSV_ROW_STATUS_LABEL,
  EMAIL_WRITER_SYSTEM_PROMPT,
  SAMPLE_CONTACTS_CSV,
  buildGenericPrompt,
  buildPersonalizedPrompt,
  domainFromEmail,
  type CsvRow,
  type CsvRowStatus,
} from "@/lib/csv-rows";
import {
  deleteCsvRow,
  importCsvRows,
  listCsvRowEvents,
  listCsvRows,
  logCsvRowEvent,
  updateCsvRow,
} from "@/lib/csv-rows.functions";


const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  categoria: fallback(z.string(), "todos").default("todos"),
  status: fallback(z.string(), "todos").default("todos"),
  personalizado: fallback(z.string(), "todos").default("todos"),
});

export const Route = createFileRoute("/_authenticated/contatos")({
  validateSearch: zodValidator(searchSchema),
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

const STATUS_OPTIONS = (Object.keys(CSV_ROW_STATUS_LABEL) as CsvRowStatus[]).map((status) => ({
  value: status,
  label: CSV_ROW_STATUS_LABEL[status],
}));

function ContatosPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [historyRow, setHistoryRow] = useState<CsvRow | null>(null);
  const [phase, setPhase] = useState<Record<string, "pesquisando" | "escrevendo">>({});
  const [manual, setManual] = useState({ nome: "", email: "", categoria: "" });


  const fetchRows = useServerFn(listCsvRows);
  const fetchEvents = useServerFn(listCsvRowEvents);
  const importRows = useServerFn(importCsvRows);
  const updateRow = useServerFn(updateCsvRow);
  const removeRow = useServerFn(deleteCsvRow);
  const research = useServerFn(researchCompany);
  const logEvent = useServerFn(logCsvRowEvent);


  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["csv-rows"],
    queryFn: () => fetchRows(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["csv-row-events"],
    queryFn: () => fetchEvents(),
  });

  const runs = useMemo(() => summarizeRuns(events).slice(0, 5), [events]);

  const counts = {
    pendente: rows.filter((r) => r.status === "pendente").length,
    processando: rows.filter((r) => r.status === "processando").length,
    gerado: rows.filter((r) => r.status === "gerado").length,
    erro: rows.filter((r) => r.status === "erro").length,
  };

  const categorias = useMemo(
    () => Array.from(new Set(rows.map((r) => r.categoria).filter(Boolean))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const term = search.q.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !`${row.nome} ${row.email}`.toLowerCase().includes(term)) return false;
      if (search.categoria !== "todos" && row.categoria !== search.categoria) return false;
      if (search.status !== "todos" && row.status !== search.status) return false;
      if (search.personalizado === "sim" && !row.is_personalized) return false;
      if (search.personalizado === "nao" && row.is_personalized) return false;
      return true;
    });
  }, [rows, search]);

  type SearchValue = z.infer<typeof searchSchema>;
  function patchSearch(patch: Partial<SearchValue>) {
    void navigate({ search: (prev: SearchValue) => ({ ...prev, ...patch }) });
  }

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

  /** Registra um evento no histórico sem interromper o processamento. */
  async function record(event: CsvRowEventInput) {
    await logEvent({ data: { event } }).catch(() => undefined);
  }

  /** Processa uma linha: pesquisa a empresa, monta o dossiê e escreve o e-mail. */
  async function processRow(row: CsvRow, runId: string) {
    const settings = loadAiSettings();
    const fromStatus = row.status;
    setPhase((prev) => ({ ...prev, [row.id]: "pesquisando" }));
    await updateRow({ data: { id: row.id, patch: { status: "processando", error_message: null } } });
    await record({
      csv_row_id: row.id,
      run_id: runId,
      from_status: fromStatus,
      to_status: "processando",
    });

    let dossier: CompanyDossier | null = null;
    let sources: ResearchSource[] = [];
    let material = "";
    let researchOk = false;
    let researchReason = "Sem domínio no e-mail";
    const domain = domainFromEmail(row.email);

    if (domain) {
      try {
        const collected = await research({
          data: { domain, nome: row.nome, categoria: row.categoria },
        });
        sources = collected.sources;
        researchReason = collected.reason;
        material = collected.material;
        if (collected.ok) {
          const raw = await callAi(
            settings,
            buildResearchPrompt({
              nome: row.nome,
              email: row.email,
              categoria: row.categoria,
              material,
            }),
            RESEARCH_SYSTEM_PROMPT,
          );
          const parsed = parseDossier(raw);
          if (isUsefulDossier(parsed)) {
            dossier = parsed;
            researchOk = true;
            researchReason = "";
          } else {
            researchReason = "Pesquisa sem fatos suficientes";
          }
        }
      } catch (error) {
        researchReason = error instanceof Error ? error.message : "Falha na pesquisa";
      }
    }

    const personalized = dossier !== null;
    const prompt = dossier
      ? buildPersonalizedPrompt({ nome: row.nome, categoria: row.categoria, dossier })
      : buildGenericPrompt({ nome: row.nome, categoria: row.categoria });


    setPhase((prev) => ({ ...prev, [row.id]: "escrevendo" }));

    try {
      const content = await callAi(settings, prompt, EMAIL_WRITER_SYSTEM_PROMPT);
      await updateRow({
        data: {
          id: row.id,
          patch: {
            status: "gerado",
            site_content: material ? material.slice(0, 6000) : null,
            generated_email: content,
            is_personalized: personalized,
            research: dossier,
            research_sources: sources,
            error_message: null,
          },
        },
      });
      await record({
        csv_row_id: row.id,
        run_id: runId,
        from_status: "processando",
        to_status: "gerado",
        is_personalized: personalized,
        site_ok: researchOk,
        site_reason: researchReason || null,
        research_ok: researchOk,
        research_sources_count: sources.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na IA";
      await updateRow({
        data: {
          id: row.id,
          patch: {
            status: "erro",
            research: dossier,
            research_sources: sources,
            error_message: message,
          },
        },
      });
      await record({
        csv_row_id: row.id,
        run_id: runId,
        from_status: "processando",
        to_status: "erro",
        site_ok: researchOk,
        site_reason: researchReason || null,
        research_ok: researchOk,
        research_sources_count: sources.length,
        error_message: message,
      });
    } finally {
      setPhase((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  }


  async function runBatch(target: CsvRow[]) {
    if (!isAiConfigured(loadAiSettings())) {
      toast.error("Configure a base URL e a API key da IA em /configuracoes.");
      return;
    }
    if (target.length === 0) {
      toast.info("Nenhuma linha para processar.");
      return;
    }

    const runId = crypto.randomUUID();
    stopRef.current = false;
    setProcessing(true);
    setProgress({ done: 0, total: target.length });

    let cursor = 0;
    const next = () => (cursor < target.length ? cursor++ : -1);

    const worker = async () => {
      for (let i = next(); i !== -1; i = next()) {
        if (stopRef.current) return;
        // Uma linha com erro nunca interrompe o lote.
        await processRow(target[i]!, runId).catch(() => undefined);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };

    await Promise.all(Array.from({ length: Math.min(2, target.length) }, worker));
    await queryClient.invalidateQueries({ queryKey: ["csv-rows"] });
    await queryClient.invalidateQueries({ queryKey: ["csv-row-events"] });
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
          <CardTitle className="text-base">1. Adicionar contatos</CardTitle>
          <CardDescription>
            Importe um CSV (nome, email, categoria) ou adicione um contato manualmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const email = manual.email.trim();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                toast.error("Informe um e-mail válido.");
                return;
              }
              importMutation.mutate(
                [{ nome: manual.nome.trim(), email, categoria: manual.categoria.trim() }],
                { onSuccess: () => setManual({ nome: "", email: "", categoria: "" }) },
              );
            }}
          >
            <Input
              aria-label="Nome"
              placeholder="Nome"
              maxLength={120}
              value={manual.nome}
              onChange={(e) => setManual((p) => ({ ...p, nome: e.target.value }))}
            />
            <Input
              aria-label="E-mail"
              type="email"
              required
              placeholder="email@empresa.com"
              maxLength={255}
              value={manual.email}
              onChange={(e) => setManual((p) => ({ ...p, email: e.target.value }))}
            />
            <Input
              aria-label="Categoria"
              placeholder="Categoria"
              maxLength={120}
              value={manual.categoria}
              onChange={(e) => setManual((p) => ({ ...p, categoria: e.target.value }))}
            />
            <Button type="submit" disabled={importMutation.isPending}>
              {importMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Adicionar
            </Button>
          </form>

        <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </CardContent>

      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Pesquisa e geração com IA</CardTitle>
          <CardDescription>
            Cada contato passa por duas fases: pesquisa na web (site da empresa + busca) e escrita
            do e-mail com base no dossiê. Sem pesquisa confiável, o texto sai genérico.
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
            <Button
              disabled={processing || counts.pendente === 0}
              onClick={() => void runBatch(rows.filter((r) => r.status === "pendente"))}
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {processing
                ? `Processando ${progress.done}/${progress.total}…`
                : `Processar pendentes (${counts.pendente})`}
            </Button>
            <Button
              variant="outline"
              disabled={processing || counts.erro === 0}
              onClick={() => void runBatch(rows.filter((r) => r.status === "erro"))}
            >
              <RefreshCcw className="size-4" />
              Reprocessar erros ({counts.erro})
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
          {processing && <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Últimas execuções
          </CardTitle>
          <CardDescription>Resumo de cada lote de geração.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma execução registrada ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {runs.map((run) => (
                <li
                  key={run.run_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <span className="text-muted-foreground">
                    {formatDateTime(run.started_at)} → {formatDateTime(run.finished_at)}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{run.rows} linhas</Badge>
                    <Badge>{run.gerado} gerados</Badge>
                    {run.erro > 0 && <Badge variant="destructive">{run.erro} erros</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de contatos</CardTitle>
          <CardDescription>{rows.length} contatos importados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RowFilters
            value={search}
            categorias={categorias}
            statusOptions={STATUS_OPTIONS}
            shown={filteredRows.length}
            total={rows.length}
            onChange={patchSearch}
            onClear={() =>
              patchSearch({ q: "", categoria: "todos", status: "todos", personalizado: "todos" })
            }
          />
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {rows.length === 0
                ? "Nenhum contato importado ainda."
                : "Nenhum contato corresponde aos filtros."}
            </p>
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
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.nome || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email}</TableCell>
                      <TableCell className="text-muted-foreground">{row.categoria || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {phase[row.id] ? (
                            <Badge variant="secondary" className="gap-1.5">
                              <Loader2 className="size-3 animate-spin" />
                              {phase[row.id] === "pesquisando"
                                ? "Pesquisando empresa…"
                                : "Escrevendo e-mail…"}
                            </Badge>
                          ) : (
                            <Badge variant={statusVariant(row.status)}>
                              {CSV_ROW_STATUS_LABEL[row.status]}
                            </Badge>
                          )}
                          {row.status === "gerado" &&
                            (row.is_personalized ? (
                              <CheckCircle2 className="size-3.5 text-emerald-500" />
                            ) : (
                              <TriangleAlert className="size-3.5 text-amber-500" />
                            ))}
                        </div>
                        {row.research_sources?.length > 0 && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {row.research_sources.length} fontes pesquisadas
                          </p>
                        )}
                        {row.error_message && (
                          <p className="text-destructive mt-1 text-xs">{row.error_message}</p>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Histórico"
                            onClick={() => setHistoryRow(row)}
                          >
                            <History className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Remover"
                            onClick={() => deleteMutation.mutate(row.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RowHistoryDialog
        row={historyRow}
        events={events}
        onOpenChange={(open) => !open && setHistoryRow(null)}
      />
    </main>
  );
}
