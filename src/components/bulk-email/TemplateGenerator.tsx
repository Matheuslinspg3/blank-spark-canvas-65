import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callAi, isAiConfigured, loadAiSettings } from "@/lib/ai-config";

const SYSTEM_PROMPT = `Você é um designer de e-mails HTML para envio B2B em português do Brasil.
Você devolve APENAS o HTML completo do e-mail, sem explicações e sem cercas de código.`;

function buildTemplatePrompt(baseEmail: string, style: string): string {
  return `Transforme o e-mail base abaixo em um TEMPLATE HTML reutilizável de campanha.

E-mail base (escrito pelo remetente, mantenha o estilo e a voz dele):
"""
${baseEmail}
"""

Preferências de estilo/marca: ${style.trim() || "(nenhuma informada — use um visual sóbrio de carta pessoal)"}

Regras obrigatórias:
- HTML completo (<!doctype html> ... </html>), com CSS apenas inline. Sem <style>, sem <script>, sem CSS externo, sem imagens externas.
- Use exatamente estas variáveis: {{nome}} na saudação, {{empresa}} quando fizer sentido citar a empresa, e {{ia_conteudo}} no lugar do corpo personalizado gerado por IA.
- A saudação deve funcionar mesmo sem nome: escreva "Olá, {{nome}}!" (o sistema limpa a vírgula quando o nome estiver vazio).
- Visual de e-mail pessoal, não de newsletter: sem faixa colorida gigante, sem banner, sem botão de call-to-action colorido, sem rodapé promocional, sem "cancelar inscrição".
- Largura máxima de leitura (~560px), fonte de sistema, texto escuro sobre fundo branco, no máximo um link discreto em texto.
- Termine com uma assinatura simples em texto (nome, cargo, empresa) baseada no e-mail base.
- Devolva SOMENTE o HTML.`;
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

type TemplateGeneratorProps = {
  disabled: boolean;
  onGenerated: (html: string) => void;
};

/** Gera o HTML do template da campanha a partir de um e-mail base do usuário. */
export function TemplateGenerator({ disabled, onGenerated }: TemplateGeneratorProps) {
  const [baseEmail, setBaseEmail] = useState("");
  const [style, setStyle] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    const settings = loadAiSettings();
    if (!isAiConfigured(settings)) {
      toast.error("Configure a IA em /configuracoes antes de gerar o template.");
      return;
    }
    if (baseEmail.trim().length < 30) {
      toast.error("Cole um e-mail base com pelo menos algumas frases.");
      return;
    }

    setLoading(true);
    try {
      const raw = await callAi(settings, buildTemplatePrompt(baseEmail, style), SYSTEM_PROMPT);
      const html = sanitizeTemplate(raw);
      if (!html.includes("<")) throw new Error("A IA não devolveu HTML válido.");
      onGenerated(html);
      toast.success("Template gerado — revise no editor abaixo.");
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
        <h3 className="text-sm font-medium">Gerar template com IA</h3>
      </div>
      <p className="text-muted-foreground text-xs">
        Cole um e-mail seu, escrito do seu jeito. A IA transforma em template HTML com as variáveis{" "}
        <code className="font-mono">{"{{nome}}"}</code>,{" "}
        <code className="font-mono">{"{{empresa}}"}</code> e{" "}
        <code className="font-mono">{"{{ia_conteudo}}"}</code>. Nada é aplicado sem você revisar.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="baseEmail" className="text-xs">
          E-mail base
        </Label>
        <Textarea
          id="baseEmail"
          rows={6}
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
          placeholder="Tom informal, cor de destaque verde, assinatura com cargo"
          onChange={(e) => setStyle(e.target.value)}
        />
      </div>

      <Button type="button" size="sm" disabled={disabled || loading} onClick={generate}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {loading ? "Gerando…" : "Gerar template"}
      </Button>
    </div>
  );
}
