import type { ScrapedPage } from "./firecrawl.server";
import { scrapePage, searchWeb } from "./firecrawl.server";

export type CollectedResearch = {
  ok: boolean;
  material: string;
  sources: { url: string; title: string }[];
  reason: string;
};

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/** Provedores de e-mail gratuitos: o domínio não é o site da empresa. */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "ig.com.br",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "globo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "zipmail.com.br",
  "r7.com",
  "oi.com.br",
  "yandex.com",
  "gmx.com",
]);

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}


function dedupe(pages: ScrapedPage[]): ScrapedPage[] {
  const seen = new Set<string>();
  const out: ScrapedPage[] = [];
  for (const page of pages) {
    const key = page.url.replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(page);
  }
  return out;
}

/** Coleta material sobre a empresa: site do domínio + busca na web. */
export async function collectResearch(input: {
  domain: string;
  nome: string;
  categoria: string;
}): Promise<CollectedResearch> {
  if (!isFirecrawlConfigured()) {
    return {
      ok: false,
      material: "",
      sources: [],
      reason: "Firecrawl não conectado neste projeto",
    };
  }

  const domain = input.domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) {
    return { ok: false, material: "", sources: [], reason: "Domínio inválido" };
  }

  const free = isFreeEmailDomain(domain);
  const nome = input.nome.trim();
  const categoria = input.categoria.trim();

  // Domínio de provedor gratuito não é o site da empresa: pesquisa pelo nome.
  const queries = free
    ? [
        nome ? `"${nome}" ${categoria}`.trim() : "",
        nome ? `${nome} ${categoria} empresa contato site` : "",
      ].filter(Boolean)
    : [`${domain} ${categoria || "empresa"}`];

  if (queries.length === 0) {
    return {
      ok: false,
      material: "",
      sources: [],
      reason: "E-mail de provedor gratuito e sem nome da empresa para pesquisar",
    };
  }

  const [site, ...searches] = await Promise.all([
    free ? Promise.resolve(null) : scrapePage(`https://${domain}`, 4000),
    ...queries.map((query) => searchWeb(query, free ? 4 : 3)),
  ]);

  const web = searches.flat() as ScrapedPage[];
  const pages = dedupe([...(site ? [site] : []), ...web]);
  if (pages.length === 0) {
    return {
      ok: false,
      material: "",
      sources: [],
      reason: free
        ? "Nenhuma fonte encontrada pelo nome da empresa"
        : "Nenhuma fonte encontrada sobre a empresa",
    };
  }


  const material = pages
    .map((page) => `## ${page.title}\n(${page.url})\n${page.text}`)
    .join("\n\n")
    .slice(0, 12000);

  if (material.length < 300) {
    return {
      ok: false,
      material: "",
      sources: pages.map((p) => ({ url: p.url, title: p.title })),
      reason: "Conteúdo insuficiente para personalizar",
    };
  }

  return {
    ok: true,
    material,
    sources: pages.map((p) => ({ url: p.url, title: p.title })),
    reason: "",
  };
}
