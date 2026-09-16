/**
 * Disparo com molde: o usuário escreve um e-mail por categoria (molde) e cada
 * empresa do CSV recebe o molde da sua categoria. Sem IA — só variáveis
 * {{coluna}} interpoladas por destinatário.
 *
 * Cada molde pode ter uma variação B (teste A/B) e um preview text (a linha
 * cinza que o Gmail mostra ao lado do assunto).
 */

import { CAFCM_HTML_EMAIL } from "./cafcm-html-template";
import { escapeHtml, interpolate, type Recipient } from "./bulk-email";
import { simpleLetterHtml } from "./simple-dispatch";

/** Coluna gravada no recipient com o molde escolhido manualmente. */
export const TEMPLATE_ID_COLUMN = "molde_id";

/** Coluna gravada no recipient com a variação usada (A/B). */
export const VARIANT_COLUMN = "variacao";

/** Colunas do CSV usadas para descobrir a categoria da empresa. */
export const CATEGORY_COLUMNS = ["categoria", "segmento", "category", "tipo"];

export type VariantLabel = "A" | "B";

export type MoldeTemplate = {
  id: string;
  /** Nome do molde — normalmente a categoria do CSV. */
  name: string;
  subject: string;
  body: string;
  /** Linha de prévia (preheader) mostrada ao lado do assunto na caixa de entrada. */
  previewText?: string;
  /** O corpo do molde é o HTML completo do e-mail (layout próprio). */
  html?: boolean;
  /** Liga o teste A/B: metade recebe a variação B. */
  ab?: boolean;
  subjectB?: string;
  bodyB?: string;
  previewTextB?: string;
};

export type TemplatePlan = {
  templates: MoldeTemplate[];
};

export const EMPTY_PLAN: TemplatePlan = { templates: [] };

export function newTemplateId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newTemplate(name: string): MoldeTemplate {
  return { id: newTemplateId(), name, subject: "", body: "", previewText: "" };
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
          previewText: String(item.previewText ?? ""),
          html: Boolean(item.html),
          ab: Boolean(item.ab),
          subjectB: String(item.subjectB ?? ""),
          bodyB: String(item.bodyB ?? ""),
          previewTextB: String(item.previewTextB ?? ""),
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
  if (!category) {
    // CSV sem coluna de categoria: com um único molde, ele vale para todos.
    return templates.length === 1 ? templates[0] : undefined;
  }
  const match = templates.find((template) => normalize(template.name) === category);
  if (match) return match;
  return templates.length === 1 ? templates[0] : undefined;
}

/** A/B ativo e variação B preenchida. */
export function hasVariantB(template: MoldeTemplate): boolean {
  return Boolean(
    template.ab && (template.subjectB ?? "").trim() && (template.bodyB ?? "").trim(),
  );
}

/**
 * Variação da linha: manual (coluna `variacao`) ou divisão automática — os
 * destinatários do molde alternam A/B pela ordem em que aparecem na lista.
 */
export function variantFor(
  row: Recipient,
  template: MoldeTemplate,
  indexInTemplate: number,
): VariantLabel {
  if (!hasVariantB(template)) return "A";
  const manual = (row[VARIANT_COLUMN] ?? "").trim().toUpperCase();
  if (manual === "A" || manual === "B") return manual;
  return indexInTemplate % 2 === 0 ? "A" : "B";
}

/** Índice da linha dentro do seu molde (usado para dividir A/B). */
export function indexInTemplate(
  rows: Recipient[],
  index: number,
  templates: MoldeTemplate[],
): number {
  const template = resolveTemplate(rows[index] ?? {}, templates);
  if (!template) return 0;
  let count = 0;
  for (let i = 0; i < index; i += 1) {
    if (resolveTemplate(rows[i] ?? {}, templates)?.id === template.id) count += 1;
  }
  return count;
}

type VariantContent = { subject: string; body: string; previewText: string };

export function variantContent(
  template: MoldeTemplate,
  variant: VariantLabel,
): VariantContent {
  if (variant === "B") {
    return {
      subject: template.subjectB ?? "",
      body: template.bodyB ?? "",
      previewText: template.previewTextB ?? "",
    };
  }
  return {
    subject: template.subject,
    body: template.body,
    previewText: template.previewText ?? "",
  };
}

export function isTemplateFilled(template: MoldeTemplate | undefined): boolean {
  return Boolean(template && template.subject.trim() && template.body.trim());
}

/** Linha pronta para envio: tem molde resolvido e preenchido. */
export function isRowReady(row: Recipient, templates: MoldeTemplate[]): boolean {
  return isTemplateFilled(resolveTemplate(row, templates));
}

export function renderSubject(
  template: MoldeTemplate,
  row: Recipient,
  variant: VariantLabel = "A",
): string {
  return interpolate(variantContent(template, variant).subject, row);
}

export function renderBody(
  template: MoldeTemplate,
  row: Recipient,
  variant: VariantLabel = "A",
): string {
  return interpolate(variantContent(template, variant).body, row);
}

/** HTML final já interpolado: carta simples ou o HTML próprio do molde. */
export function renderTemplateHtml(
  template: MoldeTemplate,
  row: Recipient,
  variant: VariantLabel = "A",
): string {
  const preview = interpolate(variantContent(template, variant).previewText, row).trim();

  // HTML próprio: o corpo já é o e-mail completo — só interpolamos variáveis.
  if (template.html) {
    const html = interpolate(variantContent(template, variant).body, row);
    if (!preview || /display:\s*none/i.test(html)) return html;
    const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(
      preview,
    )}</div>`;
    return html.replace(/(<body[^>]*>)/i, `$1${preheader}`);
  }

  const html = simpleLetterHtml(renderBody(template, row, variant));
  if (!preview) return html;
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(
    preview,
  )}</div>`;
  return html.replace(/(<body[^>]*>)/i, `$1${preheader}`);
}

/** Variáveis disponíveis para clicar no editor. */
export function availableVariables(columns: string[]): string[] {
  const base = ["nome", "empresa", "categoria"];
  const extra = columns.filter(
    (column) =>
      column &&
      column !== TEMPLATE_ID_COLUMN &&
      column !== VARIANT_COLUMN &&
      !base.includes(column),
  );
  return [...base, ...extra];
}

/**
 * Colchetes não preenchidos ([SEU NOME], [link Calendly]…) seriam enviados
 * literalmente — o editor avisa antes do disparo.
 */
export function bracketPlaceholders(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of (text || "").matchAll(/\[([^\]\n]{2,60})\]/g)) {
      found.add(`[${match[1]!.trim()}]`);
    }
  }
  return [...found];
}

/**
 * Variáveis {{...}} que ficaram vazias para o destinatário de exemplo — em
 * HTML próprio isso quebra links e saudações sem nenhum aviso visual.
 */
export function unfilledVariables(texts: string[], sample: Recipient | undefined): string[] {
  if (!sample) return [];
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of (text || "").matchAll(/\{\{\s*([^{}\n]{1,60}?)\s*\}\}/g)) {
      const token = match[0]!;
      if (interpolate(token, sample).trim() === "") found.add(token);
    }
  }
  return [...found];
}

/** Uma imagem encontrada no HTML do molde. */
export type TemplateImage = {
  /** Endereço exatamente como está no HTML. */
  src: string;
  /** Texto alternativo, quando existir. */
  alt: string;
  /** Motivo pelo qual a imagem não vai aparecer para quem receber. */
  problem: string | null;
};

const IMAGE_PLACEHOLDER_HINTS = [
  "example.com",
  "exemplo.com",
  "seudominio",
  "seusite",
  "placeholder",
  "via.placeholder",
  "placehold",
  "lorempixel",
  "dummyimage",
  "imagem.png",
  "logo.png",
  "sua-imagem",
  "url-da-imagem",
  "localhost",
  "127.0.0.1",
];

function imageProblem(src: string): string | null {
  const value = src.trim();
  if (!value) return "Endereço da imagem vazio.";
  if (value.startsWith("{{") || /\{\{/.test(value)) return null;
  if (value.startsWith("data:"))
    return "Imagem embutida no código (data:) — deixa o e-mail pesado e o Gmail corta a mensagem. Hospede a imagem e cole o link https aqui.";
  if (value.startsWith("cid:")) return "Imagem anexada (cid:) — não aparece em e-mail enviado.";
  if (value.startsWith("//")) return "Endereço sem https:// — muitos e-mails bloqueiam.";
  if (!/^https?:\/\//i.test(value))
    return "Endereço local ou relativo — só funciona no seu computador.";
  if (/^http:\/\//i.test(value)) return "Endereço http:// — use https:// para não ser bloqueado.";
  const lower = value.toLowerCase();
  if (IMAGE_PLACEHOLDER_HINTS.some((hint) => lower.includes(hint)))
    return "Parece um endereço de exemplo — troque pela imagem real.";
  return null;
}

/** Lê as imagens do HTML (tags <img> e background-image) e aponta as problemáticas. */
export function templateImages(html: string): TemplateImage[] {
  const found = new Map<string, TemplateImage>();
  for (const match of (html || "").matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim();
    const alt = (tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim();
    if (!found.has(src)) found.set(src, { src, alt, problem: imageProblem(src) });
  }
  for (const match of (html || "").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const src = (match[1] ?? "").trim();
    if (!src || found.has(src)) continue;
    found.set(src, { src, alt: "fundo", problem: imageProblem(src) });
  }
  return [...found.values()];
}

/** Troca todas as ocorrências de um endereço de imagem no HTML. */
export function replaceImageSrc(html: string, from: string, to: string): string {
  if (!from) return html;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(escaped, "g"), to);
}

/** Gmail costuma cortar o corpo quando o HTML final se aproxima de 102 KB. */
export const GMAIL_SAFE_HTML_BYTES = 90 * 1024;
export const GMAIL_WARNING_HTML_BYTES = 75 * 1024;

export type HtmlSizeLevel = "safe" | "warning" | "blocked";

export function htmlSizeBytes(html: string): number {
  return new TextEncoder().encode(html).length;
}

export function formatHtmlSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(1).replace(".0", "")} KB`;
}

export function htmlSizeLevel(html: string): HtmlSizeLevel {
  const bytes = htmlSizeBytes(html);
  if (bytes >= GMAIL_SAFE_HTML_BYTES) return "blocked";
  if (bytes >= GMAIL_WARNING_HTML_BYTES) return "warning";
  return "safe";
}

/**
 * Compactação conservadora para HTML de e-mail. Preserva comentários
 * condicionais do Outlook, conteúdo de pre/textarea e os espaços do texto.
 */
export function optimizeEmailHtml(html: string): string {
  const protectedBlocks: string[] = [];
  const protect = (value: string) => {
    const index = protectedBlocks.push(value) - 1;
    return `___EMAIL_BLOCK_${index}___`;
  };

  let optimized = html
    .replace(/<!--[\s\S]*?-->/g, (comment) =>
      /^<!--\[if\s/i.test(comment) || /<!\[endif\]-->$/i.test(comment)
        ? protect(comment)
        : "",
    )
    .replace(/<(pre|textarea)\b[\s\S]*?<\/\1>/gi, protect)
    .replace(/>\s+</g, "><")
    .replace(/[ \t]+\r?\n/g, "\n")
    .trim();

  protectedBlocks.forEach((block, index) => {
    optimized = optimized.replace(`___EMAIL_BLOCK_${index}___`, block);
  });
  return optimized;
}

export const SAMPLE_TEMPLATE_BODY = `Olá, {{nome}}!

Escrevo para falar rapidamente sobre a {{empresa}}...

Podemos conversar esta semana?

Rebeca — CAFCM`;

/** Moldes prontos da CAFCM (variáveis já no padrão do sistema). */
export type TemplatePreset = { label: string; build: () => MoldeTemplate };

const CONSTRUTORAS_A = `Olá, {{nome}},

Sou consultor da CAFCM e trabalho com construtoras da Baixada Santista na contratação de jovens aprendizes.

Empresas com 7 ou mais funcionários precisam manter a cota de aprendizagem (Lei 10.097/2000). Quando a cota fica em aberto, a fiscalização costuma cobrar valores altos por aprendiz não contratado — e o ajuste é simples de fazer antes disso.

Como funciona com a gente:
- Cuidamos do recrutamento, do curso e de toda a documentação
- Você recebe candidatos já pré-aprovados
- Contratação em poucos dias, com acompanhamento pedagógico durante todo o contrato

Faz sentido conversarmos 15 minutos esta semana para eu mostrar como está a cota da {{empresa}}?

Atenciosamente,
{{remetente}}
CAFCM — (13) 3222-1233`;

const CONSTRUTORAS_B = `Olá, {{nome}},

Uma pergunta rápida: como a {{empresa}} tem formado a equipe de obra e de escritório hoje?

Pergunto porque ajudamos construtoras da região a preencher a cota de aprendizes com jovens já preparados para a rotina do canteiro e do administrativo. Na prática, a empresa ganha gente formada do jeito dela e resolve a exigência legal no mesmo movimento.

Nós assumimos recrutamento, curso, documentação e o acompanhamento durante o contrato. O RH só escolhe entre os candidatos aprovados.

Tem 15 minutos esta semana para eu te mostrar como ficaria na prática?

Atenciosamente,
{{remetente}}
CAFCM — (13) 3222-1233`;

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    label: "HTML CAFCM — cota de aprendizagem",
    build: () => ({
      id: newTemplateId(),
      name: "Construtoras HTML",
      subject: "Sua empresa está preparada para a cota de aprendizagem?",
      previewText:
        "A CAFCM ajuda a organizar a cota, a contratação e o acompanhamento dos aprendizes.",
      body: CAFCM_HTML_EMAIL,
      html: true,
    }),
  },
  {
    label: "Construtoras e incorporadoras (A/B)",
    build: () => ({
      id: newTemplateId(),
      name: "Construtoras",
      subject: "Cota de aprendizes da {{empresa}} está em dia?",
      previewText:
        "Empresas com 7 ou mais funcionários precisam contratar aprendizes. Veja como regularizar.",
      body: CONSTRUTORAS_A,
      ab: true,
      subjectB: "Como a {{empresa}} forma a equipe hoje?",
      previewTextB: "Aprendizes prontos para o canteiro e para o administrativo, sem burocracia.",
      bodyB: CONSTRUTORAS_B,
    }),
  },
];
