import type { ScrapedPage } from "./firecrawl.server";
import { scrapePage, searchWeb } from "./firecrawl.server";

export type CollectedResearch = {
  ok: boolean;
  material: string;
  sources: { url: string; title: string }[];
  reason: string;
};

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

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
  const domain = input.domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) {
    return { ok: false, material: "", sources: [], reason: "Domínio inválido" };
  }

  const [site, web] = await Promise.all([
    scrapePage(`https://${domain}`, 4000),
    searchWeb(`${domain} ${input.categoria || "empresa"}`, 3),
  ]);

  const pages = dedupe([...(site ? [site] : []), ...web]);
  if (pages.length === 0) {
    return {
      ok: false,
      material: "",
      sources: [],
      reason: "Nenhuma fonte encontrada sobre a empresa",
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
