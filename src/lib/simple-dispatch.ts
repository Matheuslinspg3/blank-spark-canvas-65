/**
 * Disparo simples: a IA escreve assunto e corpo de cada e-mail a partir da
 * proposta digitada pelo usuário + dados da linha do CSV. Sem template HTML,
 * sem variações A/B — só uma carta curta por destinatário.
 */

import { RESEARCH_PROMPT_ENFORCEMENT } from "./ai-config";
import { escapeHtml, type Recipient } from "./bulk-email";
import { CAFCM_PROPOSAL_CONTEXT } from "./cafcm-proposal";

/** Colunas gravadas no recipient com o conteúdo gerado. */
export const SIMPLE_SUBJECT_COLUMN = "ia_assunto";
export const SIMPLE_BODY_COLUMN = "ia_conteudo";

export type SimpleBrief = {
  /** Objetivo do disparo, escrito pelo usuário. */
  proposal: string;
  /** Nome que assina o e-mail. */
  senderName: string;
  /** Cargo opcional na assinatura. */
  senderRole: string;
};

export const EMPTY_BRIEF: SimpleBrief = { proposal: "", senderName: "", senderRole: "" };

export function parseBrief(raw: string | null | undefined): SimpleBrief {
  if (!raw) return EMPTY_BRIEF;
  try {
    return { ...EMPTY_BRIEF, ...(JSON.parse(raw) as Partial<SimpleBrief>) };
  } catch {
    return { ...EMPTY_BRIEF, proposal: raw };
  }
}

/** Prompt de sistema: sempre ancorado na proposta comercial da CAFCM. */
export function buildSimpleSystemPrompt(brief: SimpleBrief): string {
  const signature = [brief.senderName.trim(), brief.senderRole.trim()]
    .filter(Boolean)
    .join(" — ");

  return `Você é um vendedor experiente da CAFCM escrevendo e-mails frios em português do Brasil.

${CAFCM_PROPOSAL_CONTEXT}

PROPOSTA DESTE DISPARO (definida pelo remetente):
${brief.proposal.trim() || "Apresentar o convênio de socioaprendizagem da CAFCM e agendar uma conversa."}

Escreva um e-mail completo e humano para o destinatário informado, com base nos dados dele.

Regras:
- Assunto curto (máx. 60 caracteres), sem CAIXA ALTA, sem emoji, sem "!!", sem palavras de promoção
  (oferta, desconto, grátis, imperdível, exclusivo).
- Corpo em texto puro, no máximo 6 linhas curtas: saudação, realidade do destinatário,
  ganho concreto com a CAFCM, convite a uma conversa rápida.
- Assine sempre como: ${signature || "o remetente informado"}.
- Tom simples e direto, como uma pessoa escreveria. Sem jargão corporativo, sem HTML, sem bullets,
  sem tom de fiscalização e sem placeholders do tipo "[seu nome]".
- Não invente números, preços, prazos ou fatos que não estejam no contexto acima.
${RESEARCH_PROMPT_ENFORCEMENT}

Responda APENAS com um JSON válido, sem cercas de código, no formato:
{"assunto": "...", "corpo": "..."}`;
}

export function buildSimpleUserPrompt(recipient: Recipient): string {
  const lines = Object.entries(recipient)
    .filter(
      ([key, value]) =>
        key !== SIMPLE_SUBJECT_COLUMN && key !== SIMPLE_BODY_COLUMN && (value ?? "").trim().length > 0,
    )
    .map(([key, value]) => `- ${key}: ${value}`);
  return `Dados do destinatário:\n${lines.join("\n")}`;
}

/** Extrai { assunto, corpo } da resposta do modelo, tolerando cercas de código. */
export function parseSimpleEmail(raw: string): { subject: string; body: string } {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        assunto?: string;
        subject?: string;
        corpo?: string;
        body?: string;
      };
      const subject = (parsed.assunto ?? parsed.subject ?? "").trim();
      const body = (parsed.corpo ?? parsed.body ?? "").trim();
      if (subject && body) return { subject, body };
    } catch {
      /* cai no fallback abaixo */
    }
  }

  // Fallback: primeira linha vira assunto, resto vira corpo.
  const [first = "", ...rest] = cleaned.split(/\r?\n/);
  return {
    subject: first.replace(/^assunto:\s*/i, "").trim().slice(0, 80),
    body: rest.join("\n").trim() || cleaned,
  };
}

/**
 * HTML mínimo de carta: sem imagens, sem botões, sem faixa colorida — o
 * formato que o Gmail costuma classificar como e-mail pessoal.
 */
export function simpleLetterHtml(body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;font-size:15px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(
      body,
    )}</div>
  </body>
</html>`;
}
