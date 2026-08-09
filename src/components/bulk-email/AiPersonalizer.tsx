import { Link } from "@tanstack/react-router";
import { Bot, CheckCircle2, Loader2, Settings2, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AI_COLUMN,
  DEFAULT_AI_SETTINGS,
  buildRecipientPrompt,
  callAi,
  isAiConfigured,
  loadAiSettings,
  type AiSettings,
} from "@/lib/ai-config";
import type { Recipient } from "@/lib/bulk-email";

type AiPersonalizerProps = {
  recipients: Recipient[];
  disabled: boolean;
  onGenerated: (recipients: Recipient[]) => void;
};

type RowState = {
  status: "pendente" | "gerando" | "ok" | "erro";
  text: string;
  error?: string;
};

/** How many recipients are processed at the same time. */
const CONCURRENCY = 3;

export function AiPersonalizer({ recipients, disabled, onGenerated }: AiPersonalizerProps) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<RowState[]>([]);
  const stopRef = useRef(false);

  useEffect(() => {
    setSettings(loadAiSettings());
  }, []);

  // Keep one row of state per recipient, preserving already generated text.
  useEffect(() => {
    setRows((prev) =>
      recipients.map((recipient, index) => {
        const existing = recipient[AI_COLUMN]?.trim();
        if (existing) return { status: "ok", text: existing };
        return prev[index] ?? { status: "pendente", text: "" };
      }),
    );
  }, [recipients]);

  const configured = isAiConfigured(settings);
  const done = rows.filter((r) => r.status === "ok" || r.status === "erro").length;
  const generated = rows.filter((r) => r.status === "ok").length;
  const failed = rows.filter((r) => r.status === "erro").length;

  async function handleGenerate() {
    if (!configured) {
      toast.error("Configure a base URL e a API key da IA primeiro.");
      return;
    }
    stopRef.current = false;
    setRunning(true);

    const output = recipients.map((r) => ({ ...r }));
    setRows(recipients.map(() => ({ status: "pendente", text: "" })));

    let cursor = 0;
    const next = () => (cursor < recipients.length ? cursor++ : -1);

    async function worker() {
      for (let index = next(); index !== -1; index = next()) {
        if (stopRef.current) return;
        const recipient = recipients[index]!;
        setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status: "gerando" } : r)));
        try {
          const content = await callAi(settings, buildRecipientPrompt(recipient));
          output[index] = { ...recipient, [AI_COLUMN]: content };
          setRows((prev) =>
            prev.map((r, i) => (i === index ? { status: "ok", text: content } : r)),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha desconhecida";
          setRows((prev) =>
            prev.map((r, i) => (i === index ? { status: "erro", text: "", error: message } : r)),
          );
        }
        onGenerated(output.map((r) => ({ ...r })));
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, recipients.length) }, worker));

    setRunning(false);
    const ok = output.filter((r) => (r[AI_COLUMN] ?? "").trim().length > 0).length;
    if (stopRef.current) toast.info(`Geração interrompida com ${ok} textos prontos`);
    else if (ok === recipients.length) toast.success(`${ok} textos personalizados gerados`);
    else if (ok === 0) toast.error("A IA não conseguiu gerar nenhum texto. Verifique as configurações.");
    else toast.warning(`${ok} de ${recipients.length} textos gerados`);
  }

  return (
    <div className="space-y-4">
      {!configured && (
        <Alert>
          <Settings2 className="size-4" />
          <AlertTitle>IA não configurada</AlertTitle>
          <AlertDescription>
            Informe a base URL e a API key na página de configurações para gerar e-mails
            personalizados por destinatário.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled || running || recipients.length === 0 || !configured}
          onClick={() => void handleGenerate()}
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {running
            ? `Gerando ${done}/${recipients.length}…`
            : `Gerar textos para ${recipients.length} destinatários`}
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
        <Button asChild variant="outline">
          <Link to="/configuracoes">
            <Settings2 className="size-4" />
            Configurar IA
          </Link>
        </Button>
        {generated > 0 && (
          <Badge variant="outline" className="gap-1.5">
            <Bot className="size-3.5" />
            {generated} prontos
          </Badge>
        )}
        {failed > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <TriangleAlert className="size-3.5" />
            {failed} com erro
          </Badge>
        )}
      </div>

      {running && <Progress value={(done / Math.max(recipients.length, 1)) * 100} />}

      {rows.length > 0 && (
        <div className="max-h-[28rem] divide-y overflow-auto rounded-lg border">
          {recipients.map((recipient, index) => {
            const row = rows[index] ?? { status: "pendente" as const, text: "" };
            return (
              <div key={`${recipient["email"]}-${index}`} className="space-y-1.5 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
                    {index + 1}
                  </span>
                  {row.status === "ok" && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />}
                  {row.status === "erro" && <XCircle className="text-destructive size-3.5 shrink-0" />}
                  {row.status === "gerando" && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
                  {row.status === "pendente" && (
                    <span className="bg-muted-foreground/40 size-2 shrink-0 rounded-full" />
                  )}
                  <p className="truncate text-xs font-medium">{recipient["email"]}</p>
                </div>
                {row.status === "ok" && (
                  <p className="text-muted-foreground pl-10 text-sm whitespace-pre-wrap">{row.text}</p>
                )}
                {row.status === "erro" && (
                  <p className="text-destructive pl-10 text-xs">{row.error}</p>
                )}
                {row.status === "gerando" && (
                  <p className="text-muted-foreground pl-10 text-xs">Pesquisando e escrevendo…</p>
                )}
                {row.status === "pendente" && (
                  <p className="text-muted-foreground pl-10 text-xs">Na fila</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Use <code className="font-mono">{`{{${AI_COLUMN}}}`}</code> no assunto ou no template HTML
        para inserir o texto gerado para cada pessoa.
      </p>
    </div>
  );
}
