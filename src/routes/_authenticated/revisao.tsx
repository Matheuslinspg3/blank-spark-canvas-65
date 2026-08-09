import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  ArrowLeft,
  CheckCircle2,
  Maximize2,
  MailCheck,
  Save,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { RowFilters } from "@/components/contatos/RowFilters";
import { DossierPanel } from "@/components/revisao/DossierPanel";
import { EmailReviewDialog } from "@/components/revisao/EmailReviewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CsvRow } from "@/lib/csv-rows";
import { listCsvRows, updateCsvRow } from "@/lib/csv-rows.functions";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  categoria: fallback(z.string(), "todos").default("todos"),
  status: fallback(z.string(), "todos").default("todos"),
  personalizado: fallback(z.string(), "todos").default("todos"),
});

type SearchValue = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/revisao")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Revisão dos e-mails gerados — Disparo Tracker" },
      {
        name: "description",
        content:
          "Revise, edite e aprove os e-mails gerados pela IA, diferenciando textos personalizados dos genéricos antes do disparo.",
      },
      { property: "og:title", content: "Revisão dos e-mails gerados — Disparo Tracker" },
      {
        property: "og:description",
        content: "Edite e aprove cada e-mail antes de enviar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RevisaoPage,
});

const APPROVAL_OPTIONS = [
  { value: "aprovado", label: "Aprovados" },
  { value: "pendente", label: "Não aprovados" },
];

function RevisaoPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const fetchRows = useServerFn(listCsvRows);
  const update = useServerFn(updateCsvRow);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["csv-rows"],
    queryFn: () => fetchRows(),
  });

  const generated = useMemo(
    () => rows.filter((r) => r.status === "gerado" && r.generated_email),
    [rows],
  );

  const categorias = useMemo(
    () => Array.from(new Set(generated.map((r) => r.categoria).filter(Boolean))).sort(),
    [generated],
  );

  const filtered = useMemo(() => {
    const term = search.q.trim().toLowerCase();
    return generated.filter((row) => {
      if (term && !`${row.nome} ${row.email}`.toLowerCase().includes(term)) return false;
      if (search.categoria !== "todos" && row.categoria !== search.categoria) return false;
      if (search.status === "aprovado" && !row.approved) return false;
      if (search.status === "pendente" && row.approved) return false;
      if (search.personalizado === "sim" && !row.is_personalized) return false;
      if (search.personalizado === "nao" && row.is_personalized) return false;
      return true;
    });
  }, [generated, search]);

  function patchSearch(patch: Partial<SearchValue>) {
    void navigate({ search: (prev: SearchValue) => ({ ...prev, ...patch }) });
  }

  const saveMutation = useMutation({
    mutationFn: (input: { id: string; text?: string; approved?: boolean }) =>
      update({
        data: {
          id: input.id,
          patch: {
            ...(input.text !== undefined ? { generated_email: input.text } : {}),
            ...(input.approved !== undefined ? { approved: input.approved } : {}),
          },
        },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["csv-rows"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const approvedCount = generated.filter((r) => r.approved).length;

  function textOf(row: CsvRow) {
    return drafts[row.id] ?? row.generated_email ?? "";
  }

  const openIndex = filtered.findIndex((r) => r.id === openId);
  const openRow = openIndex >= 0 ? filtered[openIndex]! : null;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/contatos">
            <ArrowLeft className="size-4" />
            Voltar aos contatos
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MailCheck className="text-primary size-6" />
          Revisão antes do disparo
        </h1>
        <p className="text-muted-foreground text-sm">
          {generated.length} e-mails gerados · {approvedCount} aprovados
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <RowFilters
            value={search}
            categorias={categorias}
            statusOptions={APPROVAL_OPTIONS}
            statusLabel="Aprovação"
            shown={filtered.length}
            total={generated.length}
            onChange={patchSearch}
            onClear={() =>
              patchSearch({ q: "", categoria: "todos", status: "todos", personalizado: "todos" })
            }
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {generated.length === 0
            ? "Nenhum e-mail gerado ainda. Importe contatos e rode a geração com IA."
            : "Nenhum e-mail corresponde aos filtros."}
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => (
            <Card key={row.id} className={row.approved ? "border-emerald-500/50" : undefined}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{row.nome || row.email}</CardTitle>
                  <div className="flex items-center gap-2">
                    {row.is_personalized ? (
                      <Badge className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600">
                        <Sparkles className="size-3.5" />
                        Personalizado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1.5">
                        <TriangleAlert className="size-3.5" />
                        Genérico
                      </Badge>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setOpenId(row.id)}>
                      <Maximize2 className="size-4" />
                      Abrir
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {row.email}
                  {row.categoria ? ` · ${row.categoria}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DossierPanel
                  dossier={row.research}
                  sources={row.research_sources ?? []}
                  compact
                />
                <Textarea
                  rows={10}
                  className="text-sm leading-relaxed"
                  value={textOf(row)}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={saveMutation.isPending}
                    onClick={() =>
                      saveMutation.mutate(
                        { id: row.id, text: textOf(row) },
                        { onSuccess: () => toast.success("Texto salvo") },
                      )
                    }
                  >
                    <Save className="size-4" />
                    Salvar edição
                  </Button>
                  <Button
                    variant={row.approved ? "secondary" : "default"}
                    disabled={saveMutation.isPending}
                    onClick={() =>
                      saveMutation.mutate({
                        id: row.id,
                        text: textOf(row),
                        approved: !row.approved,
                      })
                    }
                  >
                    <CheckCircle2 className="size-4" />
                    {row.approved ? "Aprovado (desfazer)" : "Aprovar para envio"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EmailReviewDialog
        row={openRow}
        text={openRow ? textOf(openRow) : ""}
        saving={saveMutation.isPending}
        hasPrev={openIndex > 0}
        hasNext={openIndex >= 0 && openIndex < filtered.length - 1}
        onTextChange={(value) =>
          openRow && setDrafts((prev) => ({ ...prev, [openRow.id]: value }))
        }
        onSave={() =>
          openRow &&
          saveMutation.mutate(
            { id: openRow.id, text: textOf(openRow) },
            { onSuccess: () => toast.success("Texto salvo") },
          )
        }
        onToggleApprove={() =>
          openRow &&
          saveMutation.mutate({
            id: openRow.id,
            text: textOf(openRow),
            approved: !openRow.approved,
          })
        }
        onPrev={() => openIndex > 0 && setOpenId(filtered[openIndex - 1]!.id)}
        onNext={() =>
          openIndex >= 0 &&
          openIndex < filtered.length - 1 &&
          setOpenId(filtered[openIndex + 1]!.id)
        }
        onOpenChange={(open) => !open && setOpenId(null)}
      />
    </main>
  );
}
