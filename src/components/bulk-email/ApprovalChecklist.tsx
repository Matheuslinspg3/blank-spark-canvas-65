import { CheckCircle2, ClipboardCheck, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DYNAMIC_FIELDS,
  downloadFile,
  htmlToPlainText,
  renderEmailHtml,
  interpolate,
  type EmailFormData,
  type Recipient,
} from "@/lib/bulk-email";
import { analyzeSpamRisk, SPAM_LEVEL_LABEL } from "@/lib/spam-check";
import { SpamCheckPanel } from "./SpamCheckPanel";

type ApprovalChecklistProps = {
  formData: EmailFormData;
  recipients: Recipient[];
  disabled?: boolean | undefined;
  confirmed: Record<string, boolean>;
  onConfirmedChange: (value: Record<string, boolean>) => void;
};

type CheckItem = {
  id: string;
  label: string;
  auto: { ok: boolean; detail: string };
};

/** Prévia final com checklist obrigatório antes de enviar ou baixar o template. */
export function ApprovalChecklist({
  formData,
  recipients,
  disabled,
  confirmed,
  onConfirmedChange,
}: ApprovalChecklistProps) {
  const [index, setIndex] = useState(0);
  const sample = recipients[Math.min(index, Math.max(recipients.length - 1, 0))];

  const subject = useMemo(
    () => interpolate(formData.subject, sample),
    [formData.subject, sample],
  );
  const html = useMemo(
    () => renderEmailHtml(formData.htmlTemplate, sample),
    [formData.htmlTemplate, sample],
  );
  const risk = useMemo(() => analyzeSpamRisk(subject, html), [subject, html]);

  const items: CheckItem[] = useMemo(() => {
    const text = htmlToPlainText(html);
    const words = text.split(/\s+/).filter(Boolean).length;
    const leftovers = /\{\{\s*[\w.-]+\s*\}\}/.test(`${subject} ${html}`);
    const usesField = DYNAMIC_FIELDS.some((field) =>
      `${formData.subject} ${formData.htmlTemplate}`.includes(`{{${field}}}`),
    );
    const hasAiText = (sample?.["ia_conteudo"] ?? "").trim().length > 0;

    return [
      {
        id: "tom",
        label: "Tom coerente com o objetivo",
        auto: {
          ok: !/\b(oferta|promoção|desconto|grátis)\b/i.test(text),
          detail: "Sem vocabulário de campanha no corpo.",
        },
      },
      {
        id: "clareza",
        label: "Clareza e tamanho",
        auto: {
          ok: words >= 40 && words <= 320,
          detail: `${words} palavras no corpo (ideal entre 40 e 320).`,
        },
      },
      {
        id: "personalizacao",
        label: "Personalização",
        auto: {
          ok: usesField && !leftovers && hasAiText,
          detail: leftovers
            ? "Ainda há variáveis não preenchidas no e-mail renderizado."
            : !usesField
              ? "O template não usa nenhum campo dinâmico."
              : hasAiText
                ? "Campos dinâmicos preenchidos e texto personalizado presente."
                : "Este destinatário está sem texto personalizado na fila.",
        },
      },
      {
        id: "spam",
        label: "Risco de spam / Promoções",
        auto: {
          ok: risk.level === "baixo",
          detail: `${SPAM_LEVEL_LABEL[risk.level]} (${risk.score}/100).`,
        },
      },
    ];
  }, [subject, html, formData, sample, risk]);

  const allConfirmed = items.every((item) => confirmed[item.id]);

  function toggle(id: string, value: boolean) {
    onConfirmedChange({ ...confirmed, [id]: value });
  }

  if (recipients.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Carregue o CSV e escreva o template para liberar a prévia de aprovação.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          Destinatário {Math.min(index + 1, recipients.length)} de {recipients.length}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Anterior
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={index >= recipients.length - 1}
          onClick={() => setIndex((i) => Math.min(recipients.length - 1, i + 1))}
        >
          Próximo
        </Button>
        <span className="text-muted-foreground truncate text-xs">{sample?.["email"]}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Assunto: </span>
            <span className="font-medium">{subject || "(sem assunto)"}</span>
          </p>
          <iframe
            title="Prévia de aprovação"
            sandbox=""
            srcDoc={html}
            className="h-96 w-full rounded-lg border bg-white"
          />
        </div>

        <div className="space-y-3">
          <div className="space-y-3 rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ClipboardCheck className="size-4" />
              Checklist de aprovação
            </p>
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <Checkbox
                  id={`check-${item.id}`}
                  checked={Boolean(confirmed[item.id])}
                  disabled={disabled}
                  onCheckedChange={(value) => toggle(item.id, value === true)}
                />
                <div className="space-y-0.5">
                  <label htmlFor={`check-${item.id}`} className="text-sm font-medium">
                    {item.label}
                  </label>
                  <p
                    className={`text-xs ${item.auto.ok ? "text-muted-foreground" : "text-destructive"}`}
                  >
                    {item.auto.ok ? "OK — " : "Atenção — "}
                    {item.auto.detail}
                  </p>
                </div>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              {allConfirmed ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 className="size-3.5" />
                  Checklist confirmado — envio e download liberados.
                </span>
              ) : (
                "Marque os quatro itens para liberar o envio e o download do template."
              )}
            </p>
          </div>

          <SpamCheckPanel subject={subject} html={html} disabled={disabled} />

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!allConfirmed}
            onClick={() =>
              downloadFile(
                `template-${new Date().toISOString().slice(0, 10)}.html`,
                formData.htmlTemplate,
                "text/html;charset=utf-8",
              )
            }
          >
            <Download className="size-4" />
            Baixar template HTML
          </Button>
        </div>
      </div>
    </div>
  );
}
