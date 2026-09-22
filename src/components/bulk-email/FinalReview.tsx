import { Check, ChevronLeft, ChevronRight, Code2, Eye, Search, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  interpolate,
  renderEmailHtml,
  type EmailFormData,
  type Recipient,
  type Reviews,
  type ReviewStatus,
} from "@/lib/bulk-email";
import { AI_COLUMN } from "@/lib/ai-config";

type FinalReviewProps = {
  recipients: Recipient[];
  formData: EmailFormData;
  reviews: Reviews;
  disabled?: boolean;
  onReviewsChange: (reviews: Reviews) => void;
};

/** Passo 3: revisar, aprovar ou rejeitar o e-mail exato de cada destinatário. */
export function FinalReview({
  recipients,
  formData,
  reviews,
  disabled,
  onReviewsChange,
}: FinalReviewProps) {
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"rendered" | "code">("rendered");
  const [history, setHistory] = useState<Reviews[]>([]);

  const counts = useMemo(() => {
    let aprovados = 0;
    let rejeitados = 0;
    for (const row of recipients) {
      const status = reviews[row["email"] ?? ""]?.status;
      if (status === "aprovado") aprovados += 1;
      if (status === "rejeitado") rejeitados += 1;
    }
    return { aprovados, rejeitados, pendentes: recipients.length - aprovados - rejeitados };
  }, [recipients, reviews]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return recipients;
    return recipients.filter((row) =>
      Object.values(row).some((value) => value.toLowerCase().includes(term)),
    );
  }, [recipients, query]);

  const current = filtered[Math.min(index, Math.max(filtered.length - 1, 0))];
  const currentEmail = current?.["email"] ?? "";
  const currentStatus = reviews[currentEmail]?.status;

  function commit(next: Reviews) {
    setHistory((prev) => [...prev.slice(-19), reviews]);
    onReviewsChange(next);
  }

  function decide(email: string, status: ReviewStatus) {
    if (!email) return;
    const next = { ...reviews };
    if (next[email]?.status === status) delete next[email];
    else next[email] = { status, at: new Date().toISOString() };
    commit(next);
  }

  function decideFiltered(status: ReviewStatus) {
    const at = new Date().toISOString();
    const next = { ...reviews };
    for (const row of filtered) {
      const email = row["email"] ?? "";
      if (email) next[email] = { status, at };
    }
    commit(next);
  }

  function undo() {
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last) onReviewsChange(last);
      return prev.slice(0, -1);
    });
  }

  if (recipients.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Carregue um CSV no passo 1 para revisar os e-mails.
      </p>
    );
  }

  const subject = interpolate(formData.subject, current);
  const html = renderEmailHtml(formData.htmlTemplate, current);
  const missingAi =
    Boolean(formData.htmlTemplate.includes(AI_COLUMN) || formData.subject.includes(AI_COLUMN)) &&
    !current?.[AI_COLUMN];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{counts.aprovados} aprovados</Badge>
          <Badge variant="destructive">{counts.rejeitados} rejeitados</Badge>
          <Badge variant="outline">{counts.pendentes} pendentes</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || filtered.length === 0}
            onClick={() => decideFiltered("aprovado")}
          >
            <Check className="size-4" />
            Aprovar filtrados ({filtered.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || filtered.length === 0}
            onClick={() => decideFiltered("rejeitado")}
          >
            <X className="size-4" />
            Rejeitar filtrados ({filtered.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || history.length === 0}
            onClick={undo}
          >
            <Undo2 className="size-4" />
            Desfazer
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode(mode === "rendered" ? "code" : "rendered")}
        >
          {mode === "rendered" ? <Code2 className="size-4" /> : <Eye className="size-4" />}
          {mode === "rendered" ? "Ver código" : "Ver renderizado"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={query}
              placeholder="Buscar destinatário"
              className="pl-9"
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
              }}
            />
          </div>
          <ScrollArea className="h-[460px] rounded-lg border">
            <ul className="divide-y">
              {filtered.map((row, i) => {
                const email = row["email"] ?? "";
                const status = reviews[email]?.status;
                const isCurrent = i === Math.min(index, filtered.length - 1);
                return (
                  <li key={`${email}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isCurrent ? "bg-primary/10" : "hover:bg-muted/60"
                      }`}
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          status === "aprovado"
                            ? "bg-primary text-primary-foreground border-primary"
                            : status === "rejeitado"
                              ? "bg-destructive text-destructive-foreground border-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {status === "aprovado" ? (
                          <Check className="size-3" />
                        ) : status === "rejeitado" ? (
                          <X className="size-3" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{row["nome"] || email}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {email}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="text-muted-foreground p-3 text-sm">
                  Nenhum destinatário encontrado.
                </li>
              )}
            </ul>
          </ScrollArea>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Assunto</p>
              <p className="truncate font-medium">{subject || "—"}</p>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                Para: {currentEmail || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={index <= 0}
                onClick={() => setIndex((prev) => Math.max(prev - 1, 0))}
                aria-label="Anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-muted-foreground text-xs">
                {filtered.length === 0 ? 0 : Math.min(index, filtered.length - 1) + 1}/
                {filtered.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={index >= filtered.length - 1}
                onClick={() => setIndex((prev) => Math.min(prev + 1, filtered.length - 1))}
                aria-label="Próximo"
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                type="button"
                disabled={disabled || !currentEmail}
                variant={currentStatus === "aprovado" ? "secondary" : "default"}
                onClick={() => decide(currentEmail, "aprovado")}
              >
                <Check className="size-4" />
                {currentStatus === "aprovado" ? "Aprovado" : "Aprovar"}
              </Button>
              <Button
                type="button"
                disabled={disabled || !currentEmail}
                variant={currentStatus === "rejeitado" ? "secondary" : "outline"}
                onClick={() => decide(currentEmail, "rejeitado")}
              >
                <X className="size-4" />
                {currentStatus === "rejeitado" ? "Rejeitado" : "Rejeitar"}
              </Button>
            </div>
          </div>

          {missingAi && (
            <p className="text-destructive text-xs">
              Este destinatário ainda não tem texto de IA ({`{{${AI_COLUMN}}}`}). Volte ao passo 2.
            </p>
          )}

          {mode === "rendered" ? (
            <iframe
              title="E-mail final"
              sandbox=""
              srcDoc={html}
              className="bg-card h-[460px] w-full rounded-lg border"
            />
          ) : (
            <pre className="bg-muted/40 h-[460px] overflow-auto rounded-lg border p-4 font-mono text-xs leading-relaxed">
              {html}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
