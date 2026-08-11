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

/** Ângulos de abordagem: cada destinatário recebe um, para os e-mails não saírem iguais. */
export const SIMPLE_ANGLES = [
  "Comece falando da operação/rotina específica desse negócio e do tipo de gente que ele precisa no dia a dia.",
  "Comece por uma dor concreta de contratação (rotatividade, dificuldade de achar gente, treinar do zero).",
  "Comece contando, em uma frase, como outras empresas parecidas dessa região resolveram isso com a CAFCM.",
  "Comece por uma pergunta curta e direta sobre como eles contratam hoje.",
  "Comece pelo ganho prático (equipe formada sob medida, menos burocracia para o RH) sem citar lei logo de cara.",
] as const;

/** Prompt de sistema: sempre ancorado na proposta comercial da CAFCM. */
export function buildSimpleSystemPrompt(brief: SimpleBrief): string {
  const signature = [brief.senderName.trim(), brief.senderRole.trim()]
    .filter(Boolean)
    .join(" — ");

  return `Você é um vendedor experiente da CAFCM escrevendo e-mails frios em português do Brasil.

${CAFCM_PROPOSAL_CONTEXT}

PROPOSTA DESTE DISPARO (definida pelo remetente):
${brief.proposal.trim() || "Apresentar o convênio de socioaprendizagem da CAFCM e agendar uma conversa."}

Escreva um e-mail único, humano e específico para este destinatário, com base nos dados dele.

Regras de escrita:
- Assunto curto (máx. 55 caracteres), em letra normal, sem CAIXA ALTA, sem emoji, sem "!!" e sem
  palavras de promoção (oferta, desconto, grátis, imperdível, exclusivo). O assunto deve mencionar
  algo do destinatário (nome da empresa, segmento ou cidade) — nunca um assunto genérico.
- Corpo em texto puro, 3 a 5 linhas curtas no total. Frases de gente, não de folheto.
- Fale do negócio do destinatário antes de falar da CAFCM.
- Termine com um convite leve e variado a uma conversa.
- Assine em linhas separadas apenas com: ${signature || "o remetente informado"} e "CAFCM".
- Não invente números, preços, prazos, telefones, e-mails ou fatos fora do contexto acima.
- Sem HTML, sem bullets, sem jargão corporativo, sem tom de fiscalização, sem placeholders "[seu nome]".

Proibido (torna o e-mail padronizado e queima o disparo):
- Citar percentuais ou artigos de lei ("5% a 15%", "Lei 10.097", "obrigatoriedade", "MTE") no primeiro
  parágrafo. No máximo uma menção leve à aprendizagem profissional, depois do gancho.
- Frases prontas como "A CAFCM cuida de tudo", "formação profissional, acompanhamento psicossocial e
  documentação", "ficar em dia com o MTE", "Podemos agendar 15 minutos esta semana?", "talentos que
  conhecem sua operação".
- Repetir a mesma estrutura/abertura de outros e-mails: varie saudação, gancho e fechamento.
${RESEARCH_PROMPT_ENFORCEMENT}

Responda APENAS com um JSON válido, sem cercas de código, no formato:
{"assunto": "...", "corpo": "..."}`;
}

export function buildSimpleUserPrompt(recipient: Recipient, index = 0): string {
  const lines = Object.entries(recipient)
    .filter(
      ([key, value]) =>
        key !== SIMPLE_SUBJECT_COLUMN && key !== SIMPLE_BODY_COLUMN && (value ?? "").trim().length > 0,
    )
    .map(([key, value]) => `- ${key}: ${value}`);
  const angle = SIMPLE_ANGLES[index % SIMPLE_ANGLES.length];
  return `Dados do destinatário:\n${lines.join("\n")}\n\nÂngulo obrigatório para este e-mail: ${angle}\nEscreva de um jeito diferente dos e-mails anteriores deste disparo.`;
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
