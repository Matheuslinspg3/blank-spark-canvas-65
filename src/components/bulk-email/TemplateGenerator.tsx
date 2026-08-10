import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { callAi, isAiConfigured, loadAiSettings } from "@/lib/ai-config";
import type { EmailVariant } from "@/lib/bulk-email";
import { analyzeSpamRisk, SPAM_LEVEL_LABEL } from "@/lib/spam-check";

const SYSTEM_PROMPT = `Você escreve e-mails B2B em português do Brasil que parecem escritos à mão por uma pessoa real.
Você devolve APENAS um objeto JSON válido, sem explicações e sem cercas de código.`;

const OBJECTIVES = [
  { value: "", label: "Não especificar" },
  { value: "informativo", label: "Informativo" },
  { value: "proposta", label: "Proposta comercial" },
  { value: "follow-up", label: "Follow-up" },
  { value: "convite", label: "Convite" },
  { value: "reativacao", label: "Reativação de contato" },
];

const TONES = [
  { value: "", label: "Não especificar" },
  { value: "formal", label: "Formal" },
  { value: "proximo", label: "Próximo / informal" },
  { value: "direto", label: "Direto ao ponto" },
];

const LENGTHS = [
  { value: "", label: "Não especificar" },
  { value: "curto", label: "Curto (até 80 palavras)" },
  { value: "medio", label: "Médio (100–150 palavras)" },
  { value: "detalhado", label: "Detalhado (até 250 palavras)" },
];

type GenerationInput = {
  signerName: string;
  signerRole: string;
  proposal: string;
  objective: string;
  audience: string;
  tone: string;
  length: string;
  baseEmail: string;
  style: string;
  count: number;
};

function labelOf(options: { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

function buildTemplatePrompt(input: GenerationInput): string {
  return `Escreva ${input.count} VARIAÇÕES completas (assunto + corpo HTML) de um e-mail de campanha, com abordagens diferentes entre si (ex.: direta ao ponto, com contexto/insight, abrindo com pergunta).

Quem assina: ${input.signerName}
Cargo / empresa de quem assina: ${input.signerRole.trim() || "(não informado — não invente cargo, assine só com o nome)"}
Proposta / objetivo do e-mail: ${input.proposal}
Tipo de e-mail: ${labelOf(OBJECTIVES, input.objective) || "(não informado)"}
Público-alvo: ${input.audience.trim() || "(não informado)"}
Tom: ${labelOf(TONES, input.tone) || "(não informado)"}
Tamanho: ${labelOf(LENGTHS, input.length) || "(não informado)"}
${input.baseEmail.trim() ? `E-mail base escrito pelo remetente (mantenha o estilo e a voz dele):\n"""\n${input.baseEmail.trim()}\n"""` : "Não há e-mail base: escreva do zero, em tom natural e direto."}
Preferências de estilo/marca: ${input.style.trim() || "(nenhuma — visual sóbrio de carta pessoal)"}

Regras obrigatórias:
- Todas as variações devem respeitar o mesmo tipo de e-mail, público, tom e tamanho informados; o que muda é a abordagem.
- NUNCA use placeholders como "[insira seu nome]", "[cargo]", "[empresa]" ou colchetes. Use os dados reais acima; se algo não foi informado, omita.
- Assine sempre com o nome real: ${input.signerName}.
- Variáveis permitidas: {{nome}} na saudação, {{empresa}} e {{cargo}} quando fizer sentido, e {{ia_conteudo}} no lugar do parágrafo personalizado (obrigatório aparecer uma vez em cada variação).
- Saudação: "Olá, {{nome}}!" (o sistema limpa a vírgula quando o nome estiver vazio).
- HTML completo (<!doctype html> ... </html>), CSS apenas inline. Sem <style>, <script>, CSS externo ou imagens.
- Visual de e-mail pessoal, não de newsletter: sem faixa colorida, sem banner, sem botão de call-to-action colorido, sem rodapé promocional, sem "cancelar inscrição".
- Largura de leitura ~560px, fonte de sistema, texto escuro sobre fundo branco, no máximo um link discreto em texto.
- Assunto curto (até 60 caracteres), humano, sem gatilhos promocionais (nada de "oferta", "novidade", "grátis", CAPS ou emoji). Pode usar {{empresa}}.

Responda SOMENTE com este JSON:
{"variants":[{"label":"nome curto da abordagem","subject":"...","html":"..."}]}`;
}

/** Remove cercas de código e elementos perigosos do HTML devolvido pela IA. */
function sanitizeTemplate(raw: string): string {
  let html = raw.trim();
  html = html.replace(/^```(?:html)?\s*/i, "").replace(/```$/i, "");
  const match = html.match(/<!doctype[\s\S]*<\/html>|<html[\s\S]*<\/html>/i);
  if (match) html = match[0];
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .trim();
}

/** Extrai as variações da resposta da IA, tolerando texto ao redor do JSON. */
function parseVariants(raw: string): EmailVariant[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(
      cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
    ) as { variants?: { label?: string; subject?: string; html?: string }[] };
    const variants = (parsed.variants ?? [])
      .filter((variant) => (variant.html ?? "").includes("<"))
      .map((variant, index) => ({
        label: (variant.label ?? "").trim() || `Variação ${String.fromCharCode(65 + index)}`,
        subject: (variant.subject ?? "").trim(),
        html: sanitizeTemplate(variant.html ?? ""),
      }));
    if (variants.length > 0) return variants;
  } catch {
    // resposta não veio em JSON — trata como HTML puro
  }
  const html = sanitizeTemplate(cleaned);
  return html.includes("<") ? [{ label: "Variação A", subject: "", html }] : [];
}

type TemplateGeneratorProps = {
  disabled: boolean;
  defaultSignerName?: string | undefined;
  /** Aplica a variação escolhida como template da campanha. */
  onGenerated: (result: { html: string; subject: string }) => void;
  /** Variações marcadas para teste A/B (2 ou mais) ou [] para envio único. */
  onAbChange?: ((variants: EmailVariant[]) => void) | undefined;
};

/** Gera 2+ variações de assunto e corpo a partir do objetivo, público e e-mail base. */
export function TemplateGenerator({
  disabled,
  defaultSignerName = "",
  onGenerated,
  onAbChange,
}: TemplateGeneratorProps) {
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerRole, setSignerRole] = useState("");
  const [proposal, setProposal] = useState("");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState("");
  const [baseEmail, setBaseEmail] = useState("");
  const [style, setStyle] = useState("");
  const [count, setCount] = useState("2");
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<EmailVariant[]>([]);
  const [applied, setApplied] = useState<number | null>(null);
  const [abIndexes, setAbIndexes] = useState<number[]>([]);

  useEffect(() => {
    setSignerName((current) => (current.trim() ? current : defaultSignerName));
  }, [defaultSignerName]);

  function applyVariant(index: number) {
    const variant = variants[index];
    if (!variant) return;
    setApplied(index);
    onGenerated({ html: variant.html, subject: variant.subject });
    toast.success(`"${variant.label}" aplicada como template da campanha.`);
  }

  function toggleAb(index: number) {
    const next = abIndexes.includes(index)
      ? abIndexes.filter((i) => i !== index)
      : [...abIndexes, index];
    setAbIndexes(next);
    const selected = next
      .map((i) => variants[i])
      .filter((variant): variant is EmailVariant => Boolean(variant));
    onAbChange?.(selected.length >= 2 ? selected : []);
    if (selected.length >= 2) {
      onGenerated({ html: selected[0]!.html, subject: selected[0]!.subject });
    }
  }

  async function generate() {
    const settings = loadAiSettings();
    if (!isAiConfigured(settings)) {
      toast.error("Configure a IA em /configuracoes antes de gerar o template.");
      return;
    }
    if (signerName.trim().length < 2) {
      toast.error("Informe o nome de quem assina o e-mail.");
      return;
    }
    if (proposal.trim().length < 10) {
      toast.error("Descreva a proposta do e-mail em uma ou duas frases.");
      return;
    }

    setLoading(true);
    try {
      const raw = await callAi(
        settings,
        buildTemplatePrompt({
          signerName: signerName.trim(),
          signerRole,
          proposal,
          objective,
          audience,
          tone,
          length,
          baseEmail,
          style,
          count: Number(count),
        }),
        SYSTEM_PROMPT,
      );
      const generated = parseVariants(raw);
      if (generated.length === 0) throw new Error("A IA não devolveu HTML válido.");
      setVariants(generated);
      setApplied(null);
      setAbIndexes([]);
      onAbChange?.([]);
      toast.success(`${generated.length} variação(ões) gerada(s) — compare e escolha abaixo.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar o template.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary size-4" />
        <h3 className="text-sm font-medium">Gerar assunto e template com IA</h3>
      </div>
      <p className="text-muted-foreground text-xs">
        Diga quem assina, a proposta e (opcional) o objetivo e o público. A IA escreve variações
        completas de assunto e corpo, já com{" "}
        <code className="font-mono">{"{{nome}}"}</code>,{" "}
        <code className="font-mono">{"{{empresa}}"}</code>,{" "}
        <code className="font-mono">{"{{cargo}}"}</code> e{" "}
        <code className="font-mono">{"{{ia_conteudo}}"}</code>.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="signerName" className="text-xs">
            Seu nome (assinatura)
          </Label>
          <Input
            id="signerName"
            value={signerName}
            disabled={disabled || loading}
            placeholder="Matheus Lins"
            onChange={(e) => setSignerName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signerRole" className="text-xs">
            Cargo e empresa (opcional)
          </Label>
          <Input
            id="signerRole"
            value={signerRole}
            disabled={disabled || loading}
            placeholder="Fundador na Acme"
            onChange={(e) => setSignerRole(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="proposal" className="text-xs">
          Qual a proposta do e-mail?
        </Label>
        <Textarea
          id="proposal"
          rows={3}
          value={proposal}
          disabled={disabled || loading}
          placeholder="Apresentar nosso serviço de automação de atendimento e propor uma conversa de 15 minutos."
          className="text-sm"
          onChange={(e) => setProposal(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Objetivo (opcional)</Label>
          <Select value={objective} onValueChange={setObjective} disabled={disabled || loading}>
            <SelectTrigger>
              <SelectValue placeholder="Não especificar" />
            </SelectTrigger>
            <SelectContent>
              {OBJECTIVES.filter((o) => o.value).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audience" className="text-xs">
            Público-alvo (opcional)
          </Label>
          <Input
            id="audience"
            value={audience}
            disabled={disabled || loading}
            placeholder="Donos de construtoras e mercados de bairro"
            onChange={(e) => setAudience(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tom (opcional)</Label>
          <Select value={tone} onValueChange={setTone} disabled={disabled || loading}>
            <SelectTrigger>
              <SelectValue placeholder="Não especificar" />
            </SelectTrigger>
            <SelectContent>
              {TONES.filter((o) => o.value).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tamanho (opcional)</Label>
          <Select value={length} onValueChange={setLength} disabled={disabled || loading}>
            <SelectTrigger>
              <SelectValue placeholder="Não especificar" />
            </SelectTrigger>
            <SelectContent>
              {LENGTHS.filter((o) => o.value).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="baseEmail" className="text-xs">
          E-mail base (opcional — para copiar seu jeito de escrever)
        </Label>
        <Textarea
          id="baseEmail"
          rows={5}
          value={baseEmail}
          disabled={disabled || loading}
          placeholder={"Olá, tudo bem?\n\nSou o João, da Acme. Vi que vocês...\n\nAbraço,\nJoão"}
          className="text-sm"
          onChange={(e) => setBaseEmail(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="templateStyle" className="text-xs">
            Estilo / marca (opcional)
          </Label>
          <Input
            id="templateStyle"
            value={style}
            disabled={disabled || loading}
            placeholder="Tom informal, assinatura com cargo"
            onChange={(e) => setStyle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Quantas variações</Label>
          <Select value={count} onValueChange={setCount} disabled={disabled || loading}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 variações</SelectItem>
              <SelectItem value="3">3 variações</SelectItem>
              <SelectItem value="4">4 variações</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" size="sm" disabled={disabled || loading} onClick={generate}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {loading ? "Gerando…" : "Gerar variações"}
      </Button>

      {variants.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-muted-foreground text-xs">
            Escolha uma variação como template ou marque duas ou mais para dividir o disparo em
            teste A/B.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {variants.map((variant, index) => {
              const risk = analyzeSpamRisk(variant.subject, variant.html);
              return (
                <div
                  key={`${variant.label}-${index}`}
                  className={`bg-background space-y-2 rounded-lg border p-3 ${
                    applied === index ? "border-primary" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{variant.label}</Badge>
                    <Badge variant={risk.level === "alto" ? "destructive" : "secondary"}>
                      {SPAM_LEVEL_LABEL[risk.level]}
                    </Badge>
                    {abIndexes.includes(index) && (
                      <Badge className="gap-1">
                        <Check className="size-3" />
                        A/B
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">{variant.subject || "(sem assunto)"}</p>
                  <iframe
                    title={`Prévia ${variant.label}`}
                    sandbox=""
                    srcDoc={variant.html}
                    className="h-56 w-full rounded border bg-white"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={applied === index ? "default" : "outline"}
                      disabled={disabled}
                      onClick={() => applyVariant(index)}
                    >
                      {applied === index ? "Aplicada" : "Usar esta"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => toggleAb(index)}
                    >
                      {abIndexes.includes(index) ? "Remover do A/B" : "Incluir no A/B"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
