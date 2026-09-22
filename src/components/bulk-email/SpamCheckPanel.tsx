import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { callAi, isAiConfigured, loadAiSettings } from "@/lib/ai-config";
import { analyzeSpamRisk, SPAM_LEVEL_LABEL } from "@/lib/spam-check";

type SpamCheckPanelProps = {
  subject: string;
  html: string;
  disabled?: boolean | undefined;
  /** Quando informado, habilita o botão "Corrigir com IA". */
  onFixed?: ((patch: { subject: string; html: string }) => void) | undefined;
};

const SYSTEM_PROMPT = `Você reescreve e-mails B2B em português do Brasil para que o Gmail os entregue na caixa principal, não em Promoções.
Você devolve APENAS um objeto JSON válido, sem explicações e sem cercas de código.`;

/** Mostra a nota de risco de Promoções e as sugestões de ajuste. */
export function SpamCheckPanel({ subject, html, disabled, onFixed }: SpamCheckPanelProps) {
  const report = useMemo(() => analyzeSpamRisk(subject, html), [subject, html]);
  const [fixing, setFixing] = useState(false);

  const tone =
    report.level === "alto"
      ? "text-destructive"
      : report.level === "medio"
        ? "text-amber-600"
        : "text-emerald-600";

  async function fixWithAi() {
    const settings = loadAiSettings();
    if (!isAiConfigured(settings)) {
      toast.error("Configure a IA em /configuracoes para corrigir automaticamente.");
      return;
    }
    setFixing(true);
    try {
      const problems = report.findings.map((f) => `- ${f.title} → ${f.suggestion}`).join("\n");
      const raw = await callAi(
        settings,
        `Corrija SOMENTE os problemas listados, preservando a mensagem, a voz do autor e as variáveis {{nome}}, {{empresa}}, {{cargo}}, {{ia_conteudo}}.

Problemas:
${problems}

Assunto atual:
${subject}

HTML atual:
"""
${html}
"""

Regras: HTML completo com CSS inline, sem <script>, sem <style>, sem imagens, no máximo um link em texto, visual de carta pessoal.
Responda SOMENTE com {"subject": "...", "html": "..."}`,
        SYSTEM_PROMPT,
      );
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```$/i, "");
      const parsed = JSON.parse(
        cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
      ) as { subject?: string; html?: string };
      if (!parsed.html) throw new Error("A IA não devolveu o HTML corrigido.");
      onFixed?.({ subject: (parsed.subject ?? subject).trim(), html: parsed.html.trim() });
      toast.success("Ajustes aplicados — confira o resultado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao corrigir com IA.");
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="border-border space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {report.level === "baixo" ? (
          <ShieldCheck className="size-4 text-emerald-600" />
        ) : (
          <ShieldAlert className={`size-4 ${tone}`} />
        )}
        <h3 className="text-sm font-medium">Verificador de Promoções</h3>
        <Badge variant={report.level === "alto" ? "destructive" : "outline"}>
          {SPAM_LEVEL_LABEL[report.level]} · {report.score}/100
        </Badge>
        {onFixed && report.findings.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={disabled || fixing}
            onClick={() => void fixWithAi()}
          >
            {fixing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {fixing ? "Corrigindo…" : "Corrigir com IA"}
          </Button>
        )}
      </div>

      <Progress value={report.score} />

      {report.findings.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <CheckCircle2 className="size-3.5 text-emerald-600" />
          Nenhum sinal de promoção encontrado no assunto, na estrutura ou na proporção de
          imagens/links.
        </p>
      ) : (
        <ul className="space-y-2 text-xs">
          {report.findings.map((finding) => (
            <li key={finding.id} className="space-y-0.5">
              <p className="font-medium">
                <span className="text-muted-foreground mr-1.5 font-normal uppercase">
                  {finding.area}
                </span>
                {finding.title}
              </p>
              <p className="text-muted-foreground">{finding.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
