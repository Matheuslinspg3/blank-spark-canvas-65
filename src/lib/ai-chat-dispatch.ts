/**
 * Modo "puro IA": o disparo é montado conversando. A IA responde sempre em
 * JSON com uma ação, que o componente executa sobre o estado do disparo.
 */

import { CAFCM_PROPOSAL_CONTEXT } from "./cafcm-proposal";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** Ação executada a partir desta mensagem (para reexibir o histórico). */
  action?: string;
  /** Cartão de confirmação pendente/resolvido de envio em massa. */
  confirm?: "send_all" | null;
  at?: string;
};

export type ChatAction =
  | { tool: "reply" }
  | { tool: "set_sender"; senderName?: string; senderEmail?: string; senderRole?: string }
  | { tool: "set_brief"; proposal: string }
  | { tool: "generate_emails"; only_missing?: boolean }
  | { tool: "edit_email"; email: string; subject?: string; body?: string }
  | { tool: "regenerate_email"; email: string }
  | { tool: "send_test"; email: string }
  | { tool: "send_all" };

export type ChatTurn = { message: string; action: ChatAction };

export type DispatchSnapshot = {
  senderName: string;
  senderEmail: string;
  signatureName: string;
  signatureRole: string;
  proposal: string;
  total: number;
  ready: number;
  columns: string[];
  sampleEmails: string[];
};

export function buildChatSystemPrompt(): string {
  return `Você é a assistente de disparos da CAFCM. Você conversa em português do Brasil com o
operador e vai montando um disparo de e-mails frios enquanto conversa.

${CAFCM_PROPOSAL_CONTEXT}

O disparo tem quatro peças: remetente (nome + e-mail verificado na Brevo), proposta do disparo,
lista de contatos (CSV) e os e-mails escritos por você. Pergunte só o que ainda falta, uma coisa
por vez, com frases curtas e diretas. Nunca peça informação que já está no estado atual.

Responda SEMPRE apenas com um JSON válido, sem cercas de código, no formato:
{"mensagem": "texto curto para o operador", "acao": { ... }}

Ações possíveis (campo "acao"):
- {"tool":"reply"} — só conversar/perguntar.
- {"tool":"set_sender","senderName":"Rebeca","senderEmail":"rh@cafcm.org.br","senderRole":"Presidente"} — campos opcionais.
- {"tool":"set_brief","proposal":"..."} — grava o objetivo do disparo com suas palavras, completo.
- {"tool":"generate_emails","only_missing":true} — escreve assunto e corpo de cada destinatário.
- {"tool":"edit_email","email":"contato@x.com","subject":"...","body":"..."} — reescreve um e-mail específico.
- {"tool":"regenerate_email","email":"contato@x.com"} — gera de novo aquele destinatário.
- {"tool":"send_test","email":"voce@empresa.com"} — envia um teste.
- {"tool":"send_all"} — pede a confirmação final de envio (o operador ainda precisa clicar em confirmar).

Regras:
- Não use "generate_emails" antes de existir CSV carregado e proposta definida.
- Não use "send_all" sem e-mails prontos e remetente definido.
- Se o operador pedir várias coisas, execute a mais importante e diga na mensagem o que falta.
- Nunca invente números, preços, leis ou fatos fora do contexto acima.
- A "mensagem" é curta (no máximo 3 frases), sem markdown pesado e sem repetir o JSON.`;
}

export function describeSnapshot(state: DispatchSnapshot): string {
  return `ESTADO ATUAL DO DISPARO:
- Remetente: ${state.senderName || "(não definido)"} <${state.senderEmail || "(não definido)"}>
- Assinatura: ${state.signatureName || "(não definida)"}${state.signatureRole ? ` — ${state.signatureRole}` : ""}
- Proposta: ${state.proposal || "(não definida)"}
- Contatos carregados: ${state.total}
- E-mails já escritos: ${state.ready}
- Colunas do CSV: ${state.columns.join(", ") || "(nenhuma)"}
- Exemplos de destinatários: ${state.sampleEmails.join(", ") || "(nenhum)"}`;
}

/** Converte a resposta bruta do modelo em { message, action }, tolerando ruído. */
export function parseChatTurn(raw: string): ChatTurn {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        mensagem?: string;
        message?: string;
        acao?: ChatAction;
        action?: ChatAction;
      };
      const message = (parsed.mensagem ?? parsed.message ?? "").trim();
      const action = parsed.acao ?? parsed.action ?? { tool: "reply" as const };
      if (message) return { message, action };
    } catch {
      /* cai no fallback */
    }
  }

  return { message: cleaned || "Certo.", action: { tool: "reply" } };
}

export const CHAT_GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Oi! Me conta em uma frase o que você quer disparar (para quem e com qual objetivo), " +
    "anexa o CSV aqui no chat e eu escrevo os e-mails. Também preciso do nome e do e-mail " +
    "verificado na Brevo que vai assinar.",
};
