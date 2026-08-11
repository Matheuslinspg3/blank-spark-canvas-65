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

export const DEFAULT_RESEARCH_PROMPT = `Você é um vendedor experiente da CAFCM escrevendo em português do Brasil (não um redator institucional).

${CAFCM_PROPOSAL_CONTEXT}

Escreva o parágrafo de abertura de um e-mail frio cujo objetivo é AGENDAR UMA CONVERSA e fechar contrato.
Estrutura obrigatória, em no máximo 3 frases curtas:
1) uma frase direta sobre a realidade do destinatário (empresa, setor, operação);
2) o ganho concreto de contratar jovem aprendiz pela CAFCM (cota legal resolvida, processo seletivo,
   formação e acompanhamento por nossa conta, sem carga extra para o RH);
3) um convite leve e específico a uma conversa rápida.

Regras de estilo:
- Linguagem simples e humana, como uma pessoa escreveria. Frases curtas.
- Nada de jargão corporativo ("soluções", "sinergia", "demandam equipes estruturadas").
- Não abra com ameaça de fiscalização nem com citação de lei logo na primeira frase; a lei, se aparecer,
  entra como contexto rápido, nunca como pressão.
- Sem saudação, sem assinatura, sem HTML, sem bullets. Apenas o texto do parágrafo.
- Não invente números, preços, prazos ou fatos que não estejam no contexto acima.`;

/** Regra de reforço aplicada sempre, mesmo se o prompt salvo for customizado. */
export const RESEARCH_PROMPT_ENFORCEMENT = `
IMPORTANTE — o que oferecemos é o convênio de socioaprendizagem da CAFCM (contratação de jovens aprendizes
de 16 a 23 anos, cota legal da Lei 10.097/2000). Escreva agora um parágrafo de VENDAS, direto ao destinatário:
realidade dele → ganho concreto com a CAFCM → convite a uma conversa rápida. Máximo 3 frases curtas, tom humano,
sem jargão e sem tom de fiscalização. NUNCA faça perguntas sobre o produto, NUNCA peça mais informações e NUNCA
devolva metatexto. Responda apenas com o parágrafo pronto.`;

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
