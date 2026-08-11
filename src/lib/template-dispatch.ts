/**
 * Disparo com molde: o usuário escreve um e-mail por categoria (molde) e cada
 * empresa do CSV recebe o molde da sua categoria. Sem IA — só variáveis
 * {{coluna}} interpoladas por destinatário.
 */

import { interpolate, type Recipient } from "./bulk-email";
import { simpleLetterHtml } from "./simple-dispatch";

/** Coluna gravada no recipient com o molde escolhido manualmente. */
export const TEMPLATE_ID_COLUMN = "molde_id";

/** Colunas do CSV usadas para descobrir a categoria da empresa. */
export const CATEGORY_COLUMNS = ["categoria", "segmento", "category", "tipo"];

export type MoldeTemplate = {
  id: string;
  /** Nome do molde — normalmente a categoria do CSV. */
  name: string;
  subject: string;
  body: string;
};

export type TemplatePlan = {
  templates: MoldeTemplate[];
};

export const EMPTY_PLAN: TemplatePlan = { templates: [] };

export function newTemplateId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newTemplate(name: string): MoldeTemplate {
  return { id: newTemplateId(), name, subject: "", body: "" };
}

export function parseTemplatePlan(raw: string | null | undefined): TemplatePlan {
  if (!raw) return { templates: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<TemplatePlan>;
    const templates = Array.isArray(parsed.templates) ? parsed.templates : [];
    return {
      templates: templates
        .filter((item): item is MoldeTemplate => Boolean(item && typeof item === "object"))
        .map((item) => ({
          id: String(item.id || newTemplateId()),
          name: String(item.name ?? ""),
          subject: String(item.subject ?? ""),
          body: String(item.body ?? ""),
        })),
    };
  } catch {
    return { templates: [] };
  }
}

export function serializeTemplatePlan(plan: TemplatePlan): string {
  return JSON.stringify(plan);
}

/** Valor da categoria da linha, se o CSV tiver alguma coluna conhecida. */
export function categoryOf(row: Recipient): string {
  for (const column of CATEGORY_COLUMNS) {
    const value = (row[column] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Categorias distintas encontradas no CSV, na ordem em que aparecem. */
export function categoriesFromRows(rows: Recipient[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const category = categoryOf(row);
    if (!category) continue;
    const key = normalize(category);
    if (!seen.has(key)) seen.set(key, category);
  }
  return [...seen.values()];
}

/** Cria um molde vazio para cada categoria nova encontrada no CSV. */
export function ensureTemplatesForRows(
  rows: Recipient[],
  templates: MoldeTemplate[],
): MoldeTemplate[] {
  const existing = new Set(templates.map((template) => normalize(template.name)));
  const created = categoriesFromRows(rows)
    .filter((category) => !existing.has(normalize(category)))
    .map((category) => newTemplate(category));
  return created.length > 0 ? [...templates, ...created] : templates;
}

/**
 * Molde de uma linha: primeiro o escolhido manualmente (molde_id), senão o
 * molde cujo nome bate com a categoria do CSV.
 */
export function resolveTemplate(
  row: Recipient,
  templates: MoldeTemplate[],
): MoldeTemplate | undefined {
  const chosen = (row[TEMPLATE_ID_COLUMN] ?? "").trim();
  if (chosen) {
    const match = templates.find((template) => template.id === chosen);
    if (match) return match;
  }
  const category = normalize(categoryOf(row));
  if (!category) return undefined;
  return templates.find((template) => normalize(template.name) === category);
}

export function isTemplateFilled(template: MoldeTemplate | undefined): boolean {
  return Boolean(template && template.subject.trim() && template.body.trim());
}

/** Linha pronta para envio: tem molde resolvido e preenchido. */
export function isRowReady(row: Recipient, templates: MoldeTemplate[]): boolean {
  return isTemplateFilled(resolveTemplate(row, templates));
}

export function renderSubject(template: MoldeTemplate, row: Recipient): string {
  return interpolate(template.subject, row);
}

export function renderBody(template: MoldeTemplate, row: Recipient): string {
  return interpolate(template.body, row);
}

/** HTML final (carta simples) do molde já interpolado para a linha. */
export function renderTemplateHtml(template: MoldeTemplate, row: Recipient): string {
  return simpleLetterHtml(renderBody(template, row));
}

/** Variáveis disponíveis para clicar no editor. */
export function availableVariables(columns: string[]): string[] {
  const base = ["nome", "empresa", "categoria"];
  const extra = columns.filter(
    (column) => column && column !== TEMPLATE_ID_COLUMN && !base.includes(column),
  );
  return [...base, ...extra];
}

export const SAMPLE_TEMPLATE_BODY = `Olá, {{nome}}!

Escrevo para falar rapidamente sobre a {{empresa}}...

Podemos conversar esta semana?

Rebeca — CAFCM`;
