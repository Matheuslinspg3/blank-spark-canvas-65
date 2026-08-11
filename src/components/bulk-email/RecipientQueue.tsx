import { Link } from "@tanstack/react-router";
import {
  Bot,
  CheckCircle2,
  Loader2,
  PenLine,
  Settings2,
  Sparkles,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_COLUMN,
  DEFAULT_AI_SETTINGS,
  RESEARCH_PROMPT_ENFORCEMENT,
  buildRecipientPrompt,
  callAi,
  isAiConfigured,
  loadAiSettings,
  type AiSettings,
} from "@/lib/ai-config";
import { DYNAMIC_FIELDS, type Recipient } from "@/lib/bulk-email";
import { CAFCM_PROPOSAL_CONTEXT } from "@/lib/cafcm-proposal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RecipientQueueProps = {
  recipients: Recipient[];
  disabled: boolean;
  onChange: (recipients: Recipient[]) => void;
};

type RowStatus = "pendente" | "gerando" | "ok" | "erro";

/** How many recipients are processed at the same time. */
const CONCURRENCY = 3;

export function RecipientQueue({ recipients, disabled, onChange }: RecipientQueueProps) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, RowStatus>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const stopRef = useRef(false);
  // Always read the freshest list inside async workers.
  const latest = useRef(recipients);
  latest.current = recipients;

  useEffect(() => {
    setSettings(loadAiSettings());
  }, []);

  const configured = isAiConfigured(settings);
  const filled = recipients.filter((r) => (r[AI_COLUMN] ?? "").trim().length > 0).length;
  const failed = Object.values(errors).filter(Boolean).length;
  const inFlight = Object.values(statuses).filter((s) => s === "gerando").length;

  function statusOf(index: number): RowStatus {
    const status = statuses[index];
    if (status === "gerando" || status === "erro") return status;
    return (recipients[index]?.[AI_COLUMN] ?? "").trim().length > 0 ? "ok" : "pendente";
  }

  function setField(index: number, field: string, value: string) {
    onChange(latest.current.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function setText(index: number, text: string) {
    onChange(latest.current.map((r, i) => (i === index ? { ...r, [AI_COLUMN]: text } : r)));
    setErrors((prev) => ({ ...prev, [index]: "" }));
  }

  async function generateOne(index: number) {
    const recipient = latest.current[index];
    if (!recipient) return;
    setStatuses((prev) => ({ ...prev, [index]: "gerando" }));
    try {
      const content = await callAi(
        settings,
        buildRecipientPrompt(recipient),
        `${settings.researchPrompt.trim()}\n\n${RESEARCH_PROMPT_ENFORCEMENT}`,
      );
      onChange(latest.current.map((r, i) => (i === index ? { ...r, [AI_COLUMN]: content } : r)));
      setStatuses((prev) => ({ ...prev, [index]: "ok" }));
      setErrors((prev) => ({ ...prev, [index]: "" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida";
      setStatuses((prev) => ({ ...prev, [index]: "erro" }));
      setErrors((prev) => ({ ...prev, [index]: message }));
    }
  }

  async function handleGenerateAll(onlyEmpty: boolean) {
    if (!configured) {
      toast.error("Configure a base URL e a API key da IA primeiro.");
      return;
    }
    const targets = recipients
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => !onlyEmpty || (r[AI_COLUMN] ?? "").trim().length === 0)
      .map(({ index }) => index);

    if (targets.length === 0) {
      toast.info("Todos os textos da fila já estão preenchidos.");
      return;
    }

    stopRef.current = false;
    setRunning(true);

    let cursor = 0;
    const next = () => (cursor < targets.length ? targets[cursor++]! : -1);

    async function worker() {
      for (let index = next(); index !== -1; index = next()) {
        if (stopRef.current) return;
        await generateOne(index);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    setRunning(false);

    const ok = latest.current.filter((r) => (r[AI_COLUMN] ?? "").trim().length > 0).length;
    if (stopRef.current) toast.info(`Geração interrompida com ${ok} textos prontos`);
    else if (ok === recipients.length) toast.success(`${ok} textos prontos na fila`);
    else if (ok === 0) toast.error("A IA não conseguiu gerar nenhum texto. Verifique as configurações.");
    else toast.warning(`${ok} de ${recipients.length} textos prontos`);
  }

  if (recipients.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Carregue o CSV no passo 1 para montar a fila de e-mails.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!configured && (
        <Alert>
          <Settings2 className="size-4" />
          <AlertTitle>IA não configurada</AlertTitle>
          <AlertDescription>
            Você ainda pode escrever os textos manualmente. Para gerar com IA, informe a base URL e a
            API key na página de configurações.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled || running || !configured}
          onClick={() => void handleGenerateAll(true)}
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {running ? `Gerando… (${inFlight} em andamento)` : "Gerar textos que faltam"}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || running || !configured}
          onClick={() => void handleGenerateAll(false)}
        >
          <Bot className="size-4" />
          Regerar todos
        </Button>
        {running && (
          <Button
            variant="destructive"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            Parar
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link to="/configuracoes">
            <Settings2 className="size-4" />
            Configurar IA
          </Link>
        </Button>
        <Badge variant="outline" className="gap-1.5">
          <CheckCircle2 className="size-3.5" />
          {filled}/{recipients.length} com texto
        </Badge>
        {failed > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <TriangleAlert className="size-3.5" />
            {failed} com erro
          </Badge>
        )}
      </div>

      <Progress value={(filled / Math.max(recipients.length, 1)) * 100} />

      <div className="max-h-[36rem] divide-y overflow-auto rounded-lg border">
        {recipients.map((recipient, index) => {
          const status = statusOf(index);
          return (
            <div key={`${recipient["email"]}-${index}`} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
                  {index + 1}
                </span>
                {status === "ok" && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />}
                {status === "erro" && <XCircle className="text-destructive size-3.5 shrink-0" />}
                {status === "gerando" && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
                {status === "pendente" && (
                  <PenLine className="text-muted-foreground size-3.5 shrink-0" />
                )}
                <p className="min-w-0 flex-1 truncate text-xs font-medium">{recipient["email"]}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || running || !configured || status === "gerando"}
                  onClick={() => void generateOne(index)}
                >
                  <Sparkles className="size-3.5" />
                  {status === "ok" ? "Regerar" : "Gerar com IA"}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {DYNAMIC_FIELDS.map((field) => (
                  <div key={field} className="space-y-1">
                    <Label htmlFor={`${field}-${index}`} className="text-muted-foreground text-xs capitalize">
                      {field}
                    </Label>
                    <Input
                      id={`${field}-${index}`}
                      className="h-8 text-xs"
                      value={recipient[field] ?? ""}
                      disabled={disabled}
                      placeholder={field === "cargo" ? "Diretor" : field === "empresa" ? "Acme" : "Ana"}
                      onChange={(event) => setField(index, field, event.target.value)}
                    />
                  </div>
                ))}
              </div>
              <Textarea
                value={recipient[AI_COLUMN] ?? ""}
                disabled={disabled || status === "gerando"}
                rows={3}
                placeholder="Escreva o texto deste destinatário ou gere com IA…"
                onChange={(event) => setText(index, event.target.value)}
              />
              {status === "erro" && errors[index] && (
                <p className="text-destructive text-xs">{errors[index]}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        Use <code className="font-mono">{`{{${AI_COLUMN}}}`}</code>,{" "}
        {DYNAMIC_FIELDS.map((field) => (
          <code key={field} className="font-mono">{`{{${field}}} `}</code>
        ))}
        no assunto ou no template HTML para inserir os dados de cada pessoa.
      </p>
    </div>
  );
}
