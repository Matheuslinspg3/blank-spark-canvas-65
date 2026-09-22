/**
 * Tipos e regras de negócio (framework-free) para os contatos importados
 * de CSV e a geração de e-mails com IA.
 */

import { dossierToText, type CompanyDossier, type ResearchSource } from "./company-research";

export type CsvRowStatus = "pendente" | "processando" | "gerado" | "erro";

export type CsvRow = {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  categoria: string;
  status: CsvRowStatus;
  site_content: string | null;
  generated_email: string | null;
  is_personalized: boolean;
  approved: boolean;
  error_message: string | null;
  research: CompanyDossier | null;
  research_sources: ResearchSource[];
  created_at: string;
  updated_at: string;
};

export type CsvRowPatch = Partial<
  Pick<
    CsvRow,
    | "status"
    | "site_content"
    | "generated_email"
    | "is_personalized"
    | "approved"
    | "error_message"
    | "research"
    | "research_sources"
  >
>;

export const CSV_ROW_STATUS_LABEL: Record<CsvRowStatus, string> = {
  pendente: "Pendente",
  processando: "Processando",
  gerado: "Gerado",
  erro: "Erro",
};

export const SAMPLE_CONTACTS_CSV = `nome,email,categoria
Ana Souza,ana@acme.com,Agência de marketing
Bruno Lima,bruno@contoso.com,E-commerce
Carla Dias,carla@globex.com,Consultoria
`;

/** Termos que indicam site inválido/parked. */
const UNTRUSTWORTHY_TERMS = [
  "404",
  "domain for sale",
  "domínio à venda",
  "dominio a venda",
  "em construção",
  "em construcao",
  "under construction",
  "coming soon",
  "página não encontrada",
  "pagina nao encontrada",
];

export const MIN_SITE_CONTENT_LENGTH = 200;

/** Verifica se o texto extraído do site pode ser usado para personalizar. */
export function isTrustworthyContent(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (value.length < MIN_SITE_CONTENT_LENGTH) return false;
  const lower = value.toLowerCase();
  return !UNTRUSTWORTHY_TERMS.some((term) => lower.includes(term));
}

/** Extrai o domínio da parte após o @ do e-mail. */
export function domainFromEmail(email: string): string | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".")) return null;
  return domain;
}

/** Prompt de redação a partir do dossiê da pesquisa. */
export function buildPersonalizedPrompt(row: {
  nome: string;
  categoria: string;
  dossier: CompanyDossier;
}): string {
  return `Escreva um e-mail comercial curto (máx. 150 palavras) em português do Brasil para:
- Nome do contato: ${row.nome || "(não informado)"}
- Categoria/segmento: ${row.categoria || "(não informado)"}

Dossiê da empresa, resultado de pesquisa na web (use APENAS estes fatos):
"""
${dossierToText(row.dossier)}
"""

Regras obrigatórias:
- Abra o e-mail ancorando em UM fato concreto do dossiê (o que a empresa faz, um serviço ou um sinal recente).
- NÃO invente informações, números, clientes, produtos ou fatos que não estejam no dossiê.
- Se algo não estiver no dossiê, simplesmente não mencione.
- Tom profissional e direto, terminando com um convite claro para conversar.
- Devolva apenas o corpo do e-mail em texto puro, sem assunto e sem HTML.`;
}

/** Prompt de fallback genérico (sem dados do site). */
export function buildGenericPrompt(row: { nome: string; categoria: string }): string {
  return `Escreva um e-mail comercial curto (máx. 120 palavras) em português do Brasil para:
- Nome: ${row.nome || "(não informado)"}
- Categoria/segmento: ${row.categoria || "(não informado)"}

Regras obrigatórias:
- Não há informações do site desta empresa: NÃO invente nada específico sobre ela.
- Escreva algo profissional e genérico, porém relevante para o segmento informado.
- Devolva apenas o corpo do e-mail em texto puro, sem assunto e sem HTML.`;
}

export const EMAIL_WRITER_SYSTEM_PROMPT =
  "Você é um redator de e-mails comerciais B2B em português do Brasil. Nunca invente fatos.";
