/**
 * Domain logic for the bulk email dashboard: CSV parsing, template
 * interpolation and the backend call. Kept framework-free so it stays testable.
 */

export type Recipient = Record<string, string>;

export type SendResult = {
  email: string;
  success: boolean;
  error?: string;
  messageId?: string;
};

export type EmailFormData = {
  senderName: string;
  senderEmail: string;
  subject: string;
  htmlTemplate: string;
};

/** Variação de e-mail (assunto + corpo) usada nos testes A/B. */
export type EmailVariant = {
  label: string;
  subject: string;
  html: string;
};

/** Campos dinâmicos que podem ser preenchidos por destinatário. */
export const DYNAMIC_FIELDS = ["nome", "empresa", "cargo"] as const;

/** Coluna que registra qual variação A/B foi usada em cada destinatário. */
export const VARIANT_COLUMN = "variacao";

/** Rate limit applied by the backend when dispatching the campaign. */
export const RATE_LIMIT_PER_SECOND = 1;
/** Above this size we warn the user before sending. */
export const LARGE_BATCH_THRESHOLD = 50;
export const TEMPLATE_STORAGE_KEY = "bulk-email:template";

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/** Splits a single CSV line honouring quoted fields and escaped quotes (""). */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  out.push(field);
  return out.map((value) => value.trim());
}

/** Detects comma vs semicolon separated files (common in pt-BR exports). */
function detectDelimiter(headerLine: string): string {
  return (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

export type ParsedCsv = { columns: string[]; rows: Recipient[] };

export function parseCsv(text: string): ParsedCsv {
  const lines = text
    .replace(/^\uFEFF/, "") // strip BOM
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("O CSV precisa de um cabeçalho e ao menos uma linha de dados.");
  }

  const delimiter = detectDelimiter(lines[0]!);
  const columns = splitCsvLine(lines[0]!, delimiter).map((c) => c.toLowerCase());

  if (!columns.includes("email")) {
    throw new Error("Coluna obrigatória 'email' não encontrada no CSV.");
  }

  const rows: Recipient[] = [];
  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line, delimiter);
    const row: Recipient = {};
    columns.forEach((column, index) => {
      row[column] = values[index] ?? "";
    });
    if (row["email"]) rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error("Nenhum destinatário com e-mail válido foi encontrado.");
  }

  return { columns, rows };
}

/* -------------------------------------------------------------------------- */
/* Templating                                                                  */
/* -------------------------------------------------------------------------- */

function titleCase(value: string): string {
  return value
    .split(/[.\-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Provedores de e-mail gratuitos: o domínio não é o nome da empresa. */
const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.com.br",
  "hotmail.com",
  "hotmail.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "zipmail.com.br",
  "protonmail.com",
  "proton.me",
];

/** Caixas genéricas: não são nome de pessoa, então a saudação fica neutra. */
const GENERIC_LOCAL_PARTS = [
  "imprensa",
  "contato",
  "contatos",
  "comercial",
  "vendas",
  "sac",
  "suporte",
  "atendimento",
  "financeiro",
  "marketing",
  "rh",
  "faleconosco",
  "fale",
  "info",
  "admin",
  "adm",
  "diretoria",
  "presidencia",
  "presidente",
  "juridico",
  "compras",
  "noreply",
  "no-reply",
  "naoresponda",
  "hello",
  "hi",
  "team",
  "equipe",
  "press",
  "media",
  "support",
  "sales",
  "contact",
];

function isGenericLocalPart(local: string): boolean {
  const normalized = local
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
  return GENERIC_LOCAL_PARTS.some((term) => normalized === term.replace(/[^a-z]/g, ""));
}

/**
 * Valores derivados do e-mail quando a coluna não existe no CSV. Caixas
 * genéricas (imprensa@, contato@) e provedores gratuitos não viram nome nem
 * empresa — nesses casos o placeholder fica vazio e a saudação é limpa depois.
 */
function fallbackValue(key: string, recipient: Recipient): string {
  const email = recipient["email"] ?? "";
  const [local = "", domain = ""] = email.split("@");
  if (key === "nome") {
    if (!local || isGenericLocalPart(local)) return "";
    return titleCase(local);
  }
  if (key === "empresa") {
    const host = domain.toLowerCase();
    if (!host || FREE_EMAIL_DOMAINS.includes(host)) return "";
    return titleCase(host.replace(/\.(com|net|org|co)(\.[a-z]{2})?$/i, ""));
  }
  return "";
}

/**
 * Remove sobras de saudação quando o nome/empresa ficou vazio:
 * "Olá, !" vira "Olá!", "para a ." desaparece.
 */
function tidyInterpolated(text: string): string {
  return text
    .replace(/,\s*(?=[!?.,])/g, "")
    .replace(/\s+([!?.,;:])/g, "$1")
    .replace(/\b(?:para|da|de|do|na|no|a|à)\s+(?:a\s+|o\s+)?(?=[.,!?;:])/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

/** Replaces {{coluna}} placeholders with the recipient's values. */
export function interpolate(template: string, recipient: Recipient | undefined): string {
  if (!recipient) return template;
  const filled = template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, raw: string) => {
    const key = raw.toLowerCase();
    const value = (recipient[key] ?? "").trim();
    return value || fallbackValue(key, recipient);
  });
  return tidyInterpolated(filled);
}

/** Palavras/sinais que empurram o e-mail para a aba Promoções do Gmail. */
const PROMO_SUBJECT_TERMS = [
  "novidade",
  "oferta",
  "desconto",
  "promoção",
  "promocao",
  "grátis",
  "gratis",
  "imperdível",
  "imperdivel",
  "exclusivo",
  "última chance",
  "ultima chance",
  "cupom",
  "black friday",
  "off",
];

/** Devolve os gatilhos promocionais encontrados no assunto. */
export function promoSubjectWarnings(subject: string): string[] {
  const value = subject.trim();
  if (!value) return [];
  const lower = value.toLowerCase();
  const found = PROMO_SUBJECT_TERMS.filter((term) => lower.includes(term));
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) found.push("texto em CAIXA ALTA");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value)) found.push("emoji");
  if (value.includes("!!")) found.push("excesso de exclamação");
  return [...new Set(found)];
}

/** Versão em texto puro do HTML, enviada junto para melhorar a entrega. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}



/** Coluna do texto gerado na fila (passo 2). */
const AI_TEXT_COLUMN = "ia_conteudo";

/**
 * Renderiza o HTML final de um destinatário. Se o template não usar
 * {{ia_conteudo}}, o texto da fila é inserido automaticamente no início do
 * corpo para que a personalização nunca se perca.
 */
export function renderEmailHtml(template: string, recipient: Recipient | undefined): string {
  const html = interpolate(template, recipient);
  const text = (recipient?.[AI_TEXT_COLUMN] ?? "").trim();
  if (!text || template.includes(AI_TEXT_COLUMN)) return html;

  const block = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto 16px;padding:0 8px;white-space:pre-wrap;">${escapeHtml(
    text,
  )}</div>`;

  if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, `$1${block}`);
  return `${block}${html}`;
}


/** Escapes user CSV values that land inside the preview iframe/HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* -------------------------------------------------------------------------- */
/* Sample assets                                                               */
/* -------------------------------------------------------------------------- */

export const SAMPLE_CSV = `email,nome,empresa
ana@exemplo.com,Ana Souza,Acme
bruno@exemplo.com,Bruno Lima,Contoso
carla@exemplo.com,Carla Dias,Globex
`;

/**
 * Template padrão em formato de carta: sem faixa colorida, sem botão de
 * campanha e sem rodapé de newsletter — o formato que o Gmail costuma
 * classificar como e-mail pessoal em vez de promoção.
 */
export const DEFAULT_TEMPLATE = `<!doctype html>
<html>
  <body style="margin:0;padding:16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;font-size:15px;line-height:1.65;">
      <p style="margin:0 0 16px;">Olá, {{nome}}!</p>

      <div style="margin:0 0 16px;white-space:pre-wrap;">{{ia_conteudo}}</div>

      <p style="margin:0 0 16px;">Se fizer sentido, respondo com mais detalhes por aqui mesmo.</p>

      <p style="margin:24px 0 0;">Abraço,<br />
      Seu Nome<br />
      <span style="color:#6b7280;">Cargo · Sua Empresa</span></p>
    </div>
  </body>
</html>`;


/* -------------------------------------------------------------------------- */
/* Backend                                                                     */
/* -------------------------------------------------------------------------- */

export type SendBulkPayload = {
  recipients: Recipient[];
  subject: string;
  htmlTemplate: string;
  senderName: string;
  senderEmail: string;
};



/** Builds a downloadable CSV log from the send results. */
export function resultsToCsv(results: SendResult[]): string {
  const rows = results.map(
    (r) =>
      `"${r.email}","${r.success ? "sucesso" : "erro"}","${(r.error ?? "").replace(/"/g, '""')}"`,
  );
  return ["email,status,erro", ...rows].join("\n");
}

/** Triggers a browser download for a text file. */
export function downloadFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Review + relatório                                                          */
/* -------------------------------------------------------------------------- */

export type ReviewStatus = "aprovado" | "rejeitado";
export type ReviewEntry = { status: ReviewStatus; at: string };
export type Reviews = Record<string, ReviewEntry>;

function csvCell(value: string): string {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR");
}

/**
 * Relatório completo pós-disparo: um registro por destinatário com o status
 * final (aprovado, rejeitado, enviado, erro) e as datas correspondentes.
 */
export function buildReportCsv(
  recipients: Recipient[],
  reviews: Reviews,
  results: SendResult[],
  sentAt?: string | null,
): string {
  const byEmail = new Map(results.map((result) => [result.email, result]));
  const header = "email,nome,status,decidido_em,enviado_em,message_id,erro";

  const lines = recipients.map((recipient) => {
    const email = recipient["email"] ?? "";
    const review = reviews[email];
    const result = byEmail.get(email);
    const status = result ? (result.success ? "enviado" : "erro") : (review?.status ?? "pendente");
    return [
      csvCell(email),
      csvCell(recipient["nome"] ?? ""),
      csvCell(status),
      csvCell(formatDate(review?.at)),
      csvCell(result ? formatDate(sentAt) : ""),
      csvCell(result?.messageId ?? ""),
      csvCell(result?.error ?? ""),
    ].join(",");
  });

  return [header, ...lines].join("\n");
}
