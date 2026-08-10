import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callAi, isAiConfigured, loadAiSettings } from "@/lib/ai-config";

const SYSTEM_PROMPT = `Você escreve e-mails B2B em português do Brasil que parecem escritos à mão por uma pessoa real.
Você devolve APENAS um objeto JSON válido, sem explicações e sem cercas de código.`;

function buildTemplatePrompt(input: {
  signerName: string;
  signerRole: string;
  proposal: string;
  baseEmail: string;
  style: string;
}): string {
  return `Escreva o ASSUNTO e o TEMPLATE HTML de uma campanha de e-mail.

Quem assina: ${input.signerName}
Cargo / empresa de quem assina: ${input.signerRole.trim() || "(não informado — não invente cargo, assine só com o nome)"}
Proposta / objetivo do e-mail: ${input.proposal}
${input.baseEmail.trim() ? `E-mail base escrito pelo remetente (mantenha o estilo e a voz dele):\n"""\n${input.baseEmail.trim()}\n"""` : "Não há e-mail base: escreva do zero, em tom natural e direto."}
Preferências de estilo/marca: ${input.style.trim() || "(nenhuma — visual sóbrio de carta pessoal)"}

Regras obrigatórias:
- NUNCA use placeholders como "[insira seu nome]", "[cargo]", "[empresa]", "XXX" ou colchetes de qualquer tipo. Use os dados reais acima; se algo não foi informado, simplesmente omita.
- Assine sempre com o nome real: ${input.signerName}.
- Variáveis permitidas apenas estas: {{nome}} na saudação, {{empresa}} quando fizer sentido citar a empresa do destinatário, e {{ia_conteudo}} no lugar do parágrafo personalizado gerado por IA (obrigatório aparecer uma vez).
- Saudação: "Olá, {{nome}}!" (o sistema limpa a vírgula quando o nome estiver vazio).
- HTML completo (<!doctype html> ... </html>), CSS apenas inline. Sem <style>, <script>, CSS externo ou imagens.
- Visual de e-mail pessoal, não de newsletter: sem faixa colorida, sem banner, sem botão de call-to-action colorido, sem rodapé promocional, sem "cancelar inscrição".
- Largura de leitura ~560px, fonte de sistema, texto escuro sobre fundo branco, no máximo um link discreto em texto.
- Assunto curto (até 60 caracteres), humano, sem gatilhos promocionais (nada de "oferta", "novidade", "grátis", CAPS ou emoji). Pode usar {{empresa}}.

Responda SOMENTE com este JSON:
{"subject": "...", "html": "..."}`;
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

/** Extrai { subject, html } da resposta da IA, tolerando texto ao redor do JSON. */
function parseResult(raw: string): { subject: string; html: string } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      subject?: string;
      html?: string;
    };
    if (parsed.html) {
      return { subject: (parsed.subject ?? "").trim(), html: sanitizeTemplate(parsed.html) };
    }
  } catch {
    // resposta não veio em JSON — trata como HTML puro
  }
  return { subject: "", html: sanitizeTemplate(cleaned) };
}

type TemplateGeneratorProps = {
  disabled: boolean;
  defaultSignerName?: string;
  onGenerated: (result: { html: string; subject: string }) => void;
};

/** Gera assunto e HTML do template da campanha a partir do nome, da proposta e de um e-mail base. */
export function TemplateGenerator({
  disabled,
  defaultSignerName = "",
  onGenerated,
}: TemplateGeneratorProps) {
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerRole, setSignerRole] = useState("");
  const [proposal, setProposal] = useState("");
  const [baseEmail, setBaseEmail] = useState("");
  const [style, setStyle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSignerName((current) => (current.trim() ? current : defaultSignerName));
  }, [defaultSignerName]);

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
          baseEmail,
          style,
        }),
        SYSTEM_PROMPT,
      );
      const { subject, html } = parseResult(raw);
      if (!html.includes("<")) throw new Error("A IA não devolveu HTML válido.");
      onGenerated({ html, subject });
      toast.success(
        subject ? "Assunto e template gerados — revise abaixo." : "Template gerado — revise abaixo.",
      );
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
        Diga quem assina e qual a proposta do e-mail. A IA escreve o assunto e o corpo como um
        humano, já com as variáveis <code className="font-mono">{"{{nome}}"}</code>,{" "}
        <code className="font-mono">{"{{empresa}}"}</code> e{" "}
        <code className="font-mono">{"{{ia_conteudo}}"}</code> — sem campos do tipo “insira seu nome
        aqui”.
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

      <Button type="button" size="sm" disabled={disabled || loading} onClick={generate}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {loading ? "Gerando…" : "Gerar assunto e template"}
      </Button>
    </div>
  );
}
