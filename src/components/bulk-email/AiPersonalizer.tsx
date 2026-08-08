import { Link } from "@tanstack/react-router";
import { Bot, Loader2, Settings2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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

export function AiPersonalizer({ recipients, disabled, onGenerated }: AiPersonalizerProps) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    setSettings(loadAiSettings());
  }, []);

  const configured = isAiConfigured(settings);
  const generated = recipients.filter((r) => (r[AI_COLUMN] ?? "").trim().length > 0).length;

  async function handleGenerate() {
    if (!configured) {
      toast.error("Configure a base URL e a API key da IA primeiro.");
      return;
    }
    setRunning(true);
    setDone(0);

    const updated: Recipient[] = [];
    let failures = 0;

    for (const recipient of recipients) {
      try {
        const content = await callAi(settings, buildRecipientPrompt(recipient));
        updated.push({ ...recipient, [AI_COLUMN]: content });
      } catch {
        failures++;
        updated.push({ ...recipient, [AI_COLUMN]: recipient[AI_COLUMN] ?? "" });
      }
      setDone((prev) => prev + 1);
      onGenerated([...updated, ...recipients.slice(updated.length)]);
    }

    setRunning(false);
    if (failures === 0) toast.success(`${updated.length} textos personalizados gerados`);
    else if (failures === updated.length) toast.error("A IA não conseguiu gerar nenhum texto.");
    else toast.warning(`${updated.length - failures} de ${updated.length} textos gerados`);
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
        <Button asChild variant="outline">
          <Link to="/configuracoes">
            <Settings2 className="size-4" />
            Configurar IA
          </Link>
        </Button>
        {generated > 0 && (
          <Badge variant="outline" className="gap-1.5">
            <Bot className="size-3.5" />
            {generated} personalizados
          </Badge>
        )}
      </div>

      {running && <Progress value={(done / Math.max(recipients.length, 1)) * 100} />}

      {generated > 0 && (
        <div className="max-h-96 space-y-3 overflow-auto rounded-lg border p-4">
          {recipients
            .filter((r) => (r[AI_COLUMN] ?? "").trim().length > 0)
            .map((r, index) => (
              <div key={`${r["email"]}-${index}`} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
                <p className="text-xs font-medium">{r["email"]}</p>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{r[AI_COLUMN]}</p>
              </div>
            ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Use <code className="font-mono">{`{{${AI_COLUMN}}}`}</code> no assunto ou no template HTML
        para inserir o texto gerado para cada pessoa.
      </p>

    </div>
  );
}
