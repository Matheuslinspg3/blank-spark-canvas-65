import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, MailCheck, Save, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CsvRow } from "@/lib/csv-rows";
import { listCsvRows, updateCsvRow } from "@/lib/csv-rows.functions";

export const Route = createFileRoute("/_authenticated/revisao")({
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

function RevisaoPage() {
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listCsvRows);
  const update = useServerFn(updateCsvRow);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["csv-rows"],
    queryFn: () => fetchRows(),
  });

  const generated = rows.filter((r) => r.status === "gerado" && r.generated_email);

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

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : generated.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum e-mail gerado ainda. Importe contatos e rode a geração com IA.
        </p>
      ) : (
        <div className="space-y-4">
          {generated.map((row) => (
            <Card key={row.id} className={row.approved ? "border-emerald-500/50" : undefined}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{row.nome || row.email}</CardTitle>
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
                </div>
                <CardDescription>
                  {row.email}
                  {row.categoria ? ` · ${row.categoria}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
    </main>
  );
}
