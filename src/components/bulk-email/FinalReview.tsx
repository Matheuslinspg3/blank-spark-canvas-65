import { Check, ChevronLeft, ChevronRight, Code2, Eye, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { interpolate, type EmailFormData, type Recipient } from "@/lib/bulk-email";
import { AI_COLUMN } from "@/lib/ai-config";

type FinalReviewProps = {
  recipients: Recipient[];
  formData: EmailFormData;
  approved: string[];
  disabled?: boolean;
  onApprovedChange: (emails: string[]) => void;
};

/** Step 3: review the exact email each recipient is going to receive. */
export function FinalReview({
  recipients,
  formData,
  approved,
  disabled,
  onApprovedChange,
}: FinalReviewProps) {
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"rendered" | "code">("rendered");

  const approvedSet = useMemo(() => new Set(approved), [approved]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return recipients;
    return recipients.filter((row) =>
      Object.values(row).some((value) => value.toLowerCase().includes(term)),
    );
  }, [recipients, query]);

  const current = filtered[Math.min(index, Math.max(filtered.length - 1, 0))];
  const currentEmail = current?.["email"] ?? "";

  function toggle(email: string) {
    const next = new Set(approvedSet);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    onApprovedChange([...next]);
  }

  if (recipients.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Carregue um CSV no passo 1 para revisar os e-mails.
      </p>
    );
  }

  const subject = interpolate(formData.subject, current);
  const html = interpolate(formData.htmlTemplate, current);
  const missingAi = Boolean(
    formData.htmlTemplate.includes(AI_COLUMN) || formData.subject.includes(AI_COLUMN),
  ) && !current?.[AI_COLUMN];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">
            {approvedSet.size} de {recipients.length} aprovados
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onApprovedChange(recipients.map((r) => r["email"] ?? ""))}
          >
            <Check className="size-4" />
            Aprovar todos
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onApprovedChange([])}
          >
            <X className="size-4" />
            Limpar
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
                          approvedSet.has(email)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {approvedSet.has(email) ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{row["nome"] || email}</span>
                        <span className="text-muted-foreground block truncate text-xs">{email}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="text-muted-foreground p-3 text-sm">Nenhum destinatário encontrado.</li>
              )}
            </ul>
          </ScrollArea>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Assunto</p>
              <p className="truncate font-medium">{subject || "—"}</p>
              <p className="text-muted-foreground mt-1 truncate text-xs">Para: {currentEmail || "—"}</p>
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
                {filtered.length === 0 ? 0 : Math.min(index, filtered.length - 1) + 1}/{filtered.length}
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
                variant={approvedSet.has(currentEmail) ? "secondary" : "default"}
                onClick={() => toggle(currentEmail)}
              >
                <Check className="size-4" />
                {approvedSet.has(currentEmail) ? "Aprovado" : "Aprovar"}
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
