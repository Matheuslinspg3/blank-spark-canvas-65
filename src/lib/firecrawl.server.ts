/**
 * Acesso ao Firecrawl pelo gateway de conectores da Lovable.
 * Server-only: nunca importar deste arquivo em código de navegador.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

export type ScrapedPage = { url: string; title: string; text: string };

/** Indica se as credenciais do gateway/Firecrawl estão presentes no servidor. */
export function isFirecrawlConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["FIRECRAWL_API_KEY"]);
}

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Firecrawl não está conectado neste projeto.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Firecrawl ${response.status}: ${raw.slice(0, 300)}`);
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Resposta inválida do Firecrawl");
  }
}

function pick(source: Record<string, unknown>, key: string): unknown {
  if (source[key] !== undefined) return source[key];
  const data = source["data"];
  if (data && typeof data === "object") return (data as Record<string, unknown>)[key];
  return undefined;
}

function clean(markdown: string, limit: number): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|-]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

/** Lê uma página e devolve o texto limpo. Devolve null quando falha. */
export async function scrapePage(url: string, limit = 4000): Promise<ScrapedPage | null> {
  try {
    const result = await post("/scrape", {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 20000,
    });
    const markdown = pick(result, "markdown");
    const metadata = (pick(result, "metadata") ?? {}) as Record<string, unknown>;
    if (typeof markdown !== "string") return null;
    const text = clean(markdown, limit);
    if (!text) return null;
    return {
      url,
      title: typeof metadata["title"] === "string" ? metadata["title"] : url,
      text,
    };
  } catch {
    return null;
  }
}

/** Busca na web e devolve os resultados já com conteúdo. */
export async function searchWeb(query: string, limit = 3): Promise<ScrapedPage[]> {
  try {
    const result = await post("/search", {
      query,
      limit,
      scrapeOptions: { formats: ["markdown"] },
    });
    const list = (pick(result, "web") ?? pick(result, "results") ?? result["data"]) as unknown;
    if (!Array.isArray(list)) return [];
    const pages = list
      .map((item) => {
        const entry = item as Record<string, unknown>;
        const url = typeof entry["url"] === "string" ? entry["url"] : "";
        const title = typeof entry["title"] === "string" ? entry["title"] : url;
        const markdown = typeof entry["markdown"] === "string" ? entry["markdown"] : "";
        const description =
          typeof entry["description"] === "string" ? entry["description"] : "";
        const text = clean(markdown || description, 2500);
        return url ? { url, title, text } : null;
      })
      .filter((page): page is ScrapedPage => page !== null);

    // A busca costuma devolver só o snippet: abre as páginas mais curtas.
    const enriched = await Promise.all(
      pages.map(async (page) => {
        if (page.text.length >= 400) return page;
        const full = await scrapePage(page.url, 2500);
        return full ? { ...full, title: page.title || full.title } : page;
      }),
    );

    return enriched.filter((page) => page.text.length > 0);
  } catch {
    return [];
  }
}

