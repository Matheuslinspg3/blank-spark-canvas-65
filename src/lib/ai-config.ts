/**
 * Configuração da IA usada para gerar e-mails personalizados a partir dos
 * dados do CSV. As credenciais ficam apenas no navegador (localStorage).
 */

import { CAFCM_PROPOSAL_CONTEXT } from "./cafcm-proposal";

export type AiSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  researchPrompt: string;
};

export const AI_SETTINGS_KEY = "bulk-email:ai-settings";

/** Coluna criada no CSV com o texto gerado pela IA. */
export const AI_COLUMN = "ia_conteudo";

export const DEFAULT_RESEARCH_PROMPT = `Você é um redator de e-mails comerciais em português do Brasil, escrevendo em nome da CAFCM.

${CAFCM_PROPOSAL_CONTEXT}

Com base nos dados do destinatário abaixo, use o contexto da empresa/pessoa e escreva um parágrafo
curto (no máximo 3 frases) altamente personalizado para abrir o e-mail, conectando a realidade do
destinatário à proposta de jovem aprendiz da CAFCM.
Não use saudação, assinatura ou HTML — devolva apenas o texto do parágrafo.`;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  researchPrompt: DEFAULT_RESEARCH_PROMPT,
};

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    return { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAiSettings() {
  localStorage.removeItem(AI_SETTINGS_KEY);
}

export function isAiConfigured(settings: AiSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.apiKey.trim().length > 0;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

/** Chamada única a uma API compatível com OpenAI (chat completions). */
export async function callAi(
  settings: AiSettings,
  userContent: string,
  systemContent = settings.researchPrompt,
): Promise<string> {
  const response = await fetch(endpoint(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("A IA não retornou conteúdo.");
  return content;
}

/** Testa as credenciais com um prompt mínimo. */
export async function testAiConnection(settings: AiSettings): Promise<string> {
  return callAi(settings, "Responda apenas: ok", "Você é um serviço de teste de conexão.");
}

/** Monta o prompt de pesquisa a partir das colunas do destinatário. */
export function buildRecipientPrompt(recipient: Record<string, string>): string {
  const lines = Object.entries(recipient)
    .filter(([key, value]) => key !== AI_COLUMN && value.trim().length > 0)
    .map(([key, value]) => `- ${key}: ${value}`);
  return `Dados do destinatário:\n${lines.join("\n")}`;
}
