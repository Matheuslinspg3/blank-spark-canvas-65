/** Dossiê da empresa produzido pela etapa de pesquisa. */

export type ResearchSource = { url: string; title: string };

export type CompanyDossier = {
  empresa: string;
  resumo: string;
  servicos: string[];
  publico: string;
  diferenciais: string[];
  sinais_recentes: string[];
};

export const EMPTY_DOSSIER: CompanyDossier = {
  empresa: "",
  resumo: "",
  servicos: [],
  publico: "",
  diferenciais: [],
  sinais_recentes: [],
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Lê o JSON devolvido pela IA, tolerando cercas de código e texto ao redor. */
export function parseDossier(raw: string): CompanyDossier | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const dossier: CompanyDossier = {
    empresa: text(obj["empresa"]),
    resumo: text(obj["resumo"]),
    servicos: stringList(obj["servicos"]),
    publico: text(obj["publico"]),
    diferenciais: stringList(obj["diferenciais"]),
    sinais_recentes: stringList(obj["sinais_recentes"]),
  };
  if (!dossier.resumo && dossier.servicos.length === 0) return null;
  return dossier;
}

/** O dossiê só serve para personalizar se trouxer conteúdo concreto. */
export function isUsefulDossier(dossier: CompanyDossier | null): dossier is CompanyDossier {
  if (!dossier) return false;
  return dossier.resumo.length >= 60 || dossier.servicos.length >= 2;
}

/** Versão em texto do dossiê, usada dentro do prompt de redação. */
export function dossierToText(dossier: CompanyDossier): string {
  const lines = [
    dossier.empresa && `Empresa: ${dossier.empresa}`,
    dossier.resumo && `O que faz: ${dossier.resumo}`,
    dossier.servicos.length > 0 && `Serviços/produtos: ${dossier.servicos.join("; ")}`,
    dossier.publico && `Público atendido: ${dossier.publico}`,
    dossier.diferenciais.length > 0 && `Diferenciais: ${dossier.diferenciais.join("; ")}`,
    dossier.sinais_recentes.length > 0 && `Sinais recentes: ${dossier.sinais_recentes.join("; ")}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export const RESEARCH_SYSTEM_PROMPT =
  "Você é um analista de pesquisa B2B. Extrai apenas fatos presentes no material fornecido e responde somente com JSON válido.";

/** Prompt da etapa 1: transformar o material coletado em dossiê JSON. */
export function buildResearchPrompt(input: {
  nome: string;
  email: string;
  categoria: string;
  material: string;
}): string {
  return `Analise o material coletado sobre a empresa e devolva um dossiê factual.

Contato: ${input.nome || "(não informado)"} <${input.email}>
Categoria informada na lista: ${input.categoria || "(não informada)"}

Material coletado (site da empresa e resultados de busca na web):
"""
${input.material}
"""

Responda APENAS com JSON neste formato:
{
  "empresa": "nome da empresa",
  "resumo": "2 a 3 frases sobre o que a empresa faz",
  "servicos": ["serviço ou produto"],
  "publico": "quem ela atende",
  "diferenciais": ["diferencial concreto citado no material"],
  "sinais_recentes": ["novidade, lançamento ou notícia recente citada no material"]
}

Regras:
- Use SOMENTE informações presentes no material. Nada de suposições.
- Campo sem evidência: string vazia "" ou lista vazia [].
- Nada de texto fora do JSON.`;
}
