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

/** Replaces {{coluna}} placeholders with the recipient's values (vazio quando não existe). */
export function interpolate(template: string, recipient: Recipient | undefined): string {
  if (!recipient) return template;
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    return recipient[key.toLowerCase()] ?? "";
  });
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

export const DEFAULT_TEMPLATE = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#4f46e5;padding:28px 32px;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">Olá, {{nome}}!</h1>
          <p style="margin:6px 0 0;opacity:.85;font-size:14px;">Uma novidade para a {{empresa}}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Preparamos algo especial para você e para o time da <strong>{{empresa}}</strong>.</p>
          <p style="margin:0 0 24px;">Clique no botão abaixo para conferir os detalhes.</p>
          <a href="https://exemplo.com" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">Ver novidade</a>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;background:#f9fafb;color:#6b7280;font-size:12px;">
          Você recebeu este e-mail porque faz parte da nossa lista.<br />
          <a href="#" style="color:#6b7280;">Cancelar inscrição</a>
        </td>
      </tr>
    </table>
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
