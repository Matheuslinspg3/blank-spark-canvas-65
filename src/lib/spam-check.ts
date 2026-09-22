/**
 * Verificador de risco de "Promoções": analisa assunto e HTML e devolve
 * achados com motivo e sugestão de ajuste. Puro e testável.
 */

export type SpamLevel = "baixo" | "medio" | "alto";

export type SpamFinding = {
  id: string;
  area: "assunto" | "estrutura" | "midia";
  weight: number;
  title: string;
  suggestion: string;
};

export type SpamReport = {
  score: number; // 0 (limpo) a 100 (muito arriscado)
  level: SpamLevel;
  findings: SpamFinding[];
};

const PROMO_TERMS = [
  "oferta",
  "ofertas",
  "desconto",
  "descontos",
  "promoção",
  "promocao",
  "grátis",
  "gratis",
  "gratuito",
  "imperdível",
  "imperdivel",
  "exclusivo",
  "última chance",
  "ultima chance",
  "cupom",
  "black friday",
  "novidade",
  "lançamento",
  "lancamento",
  "aproveite",
  "garanta já",
  "garanta ja",
  "clique aqui",
  "sorteio",
  "ganhe",
  "economize",
];

function countMatches(text: string, regex: RegExp): number {
  return (text.match(regex) ?? []).length;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Analisa assunto + HTML e devolve a nota de risco com sugestões. */
export function analyzeSpamRisk(subject: string, html: string): SpamReport {
  const findings: SpamFinding[] = [];
  const subjectValue = subject.trim();
  const subjectLower = subjectValue.toLowerCase();
  const body = html ?? "";
  const bodyText = stripTags(body);
  const bodyLower = bodyText.toLowerCase();

  /* ------------------------------ assunto ------------------------------ */

  const subjectTerms = PROMO_TERMS.filter((term) => subjectLower.includes(term));
  if (subjectTerms.length > 0) {
    findings.push({
      id: "assunto-termos",
      area: "assunto",
      weight: 12 * Math.min(subjectTerms.length, 3),
      title: `Palavras promocionais no assunto: ${subjectTerms.join(", ")}`,
      suggestion: "Troque por uma frase neutra que descreva o motivo real do contato.",
    });
  }

  const letters = subjectValue.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    findings.push({
      id: "assunto-caps",
      area: "assunto",
      weight: 15,
      title: "Assunto em CAIXA ALTA",
      suggestion: "Escreva o assunto com capitalização normal de frase.",
    });
  }

  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(subjectValue)) {
    findings.push({
      id: "assunto-emoji",
      area: "assunto",
      weight: 12,
      title: "Emoji no assunto",
      suggestion: "Remova o emoji — é um sinal clássico de campanha de marketing.",
    });
  }

  if (subjectValue.includes("!!") || countMatches(subjectValue, /!/g) > 1) {
    findings.push({
      id: "assunto-exclamacao",
      area: "assunto",
      weight: 8,
      title: "Excesso de exclamação no assunto",
      suggestion: "Use no máximo um ponto final; evite exclamações.",
    });
  }

  if (subjectValue.length > 70) {
    findings.push({
      id: "assunto-longo",
      area: "assunto",
      weight: 6,
      title: `Assunto longo (${subjectValue.length} caracteres)`,
      suggestion: "Reduza para até 60 caracteres, como num e-mail pessoal.",
    });
  }

  if (!subjectValue) {
    findings.push({
      id: "assunto-vazio",
      area: "assunto",
      weight: 20,
      title: "Assunto vazio",
      suggestion: "Escreva um assunto curto e específico.",
    });
  }

  /* ----------------------------- estrutura ----------------------------- */

  const bodyTerms = PROMO_TERMS.filter((term) => bodyLower.includes(term));
  if (bodyTerms.length >= 2) {
    findings.push({
      id: "corpo-termos",
      area: "estrutura",
      weight: 6 * Math.min(bodyTerms.length, 4),
      title: `Palavras promocionais no corpo: ${bodyTerms.slice(0, 5).join(", ")}`,
      suggestion: "Reescreva em tom de conversa, sem vocabulário de campanha.",
    });
  }

  if (/cancelar\s+inscri|descadastr|unsubscribe/i.test(body)) {
    findings.push({
      id: "unsubscribe",
      area: "estrutura",
      weight: 14,
      title: 'Rodapé de newsletter ("cancelar inscrição")',
      suggestion:
        'Em e-mail 1:1, ofereça a saída em texto simples ("me avise que não envio mais").',
    });
  }

  const buttonLike =
    /<a[^>]+style="[^"]*background(?:-color)?\s*:\s*(?!(?:transparent|none|#fff|#ffffff|white))/i.test(
      body,
    ) || /border-radius[^;"]*;[^"]*background/i.test(body);
  if (buttonLike) {
    findings.push({
      id: "cta-botao",
      area: "estrutura",
      weight: 16,
      title: "Botão de call-to-action colorido",
      suggestion: "Troque o botão por um link discreto em texto dentro da frase.",
    });
  }

  if (/<table/i.test(body) && countMatches(body, /<table/gi) > 2) {
    findings.push({
      id: "tabelas",
      area: "estrutura",
      weight: 8,
      title: "Layout construído com muitas tabelas",
      suggestion: "Simplifique para parágrafos — e-mail pessoal não tem grid de newsletter.",
    });
  }

  if (/background(?:-color)?\s*:\s*(?:#(?!fff|ffffff)[0-9a-f]{3,6})/i.test(body)) {
    const banner = /(?:height|padding)\s*:\s*(?:[4-9]\d|\d{3,})px/i.test(body);
    if (banner) {
      findings.push({
        id: "faixa",
        area: "estrutura",
        weight: 12,
        title: "Faixa/banner colorido no topo",
        suggestion: "Remova a faixa e comece o e-mail direto pela saudação.",
      });
    }
  }

  if (bodyText.length > 0 && bodyText.length < 200) {
    findings.push({
      id: "texto-curto",
      area: "estrutura",
      weight: 6,
      title: "Muito pouco texto",
      suggestion: "E-mails muito curtos e visuais parecem anúncio; escreva ao menos 2 parágrafos.",
    });
  }

  if (bodyText.length > 2200) {
    findings.push({
      id: "texto-longo",
      area: "estrutura",
      weight: 5,
      title: "Texto muito longo",
      suggestion: "Corte para no máximo ~1500 caracteres; e-mails longos reduzem resposta.",
    });
  }

  /* --------------------------- imagens e links -------------------------- */

  const images = countMatches(body, /<img\b/gi);
  const links = countMatches(body, /<a\b/gi);
  const paragraphs = Math.max(countMatches(body, /<p\b/gi), 1);

  if (images > 0) {
    findings.push({
      id: "imagens",
      area: "midia",
      weight: images >= 2 ? 18 : 10,
      title: `${images} imagem(ns) no e-mail`,
      suggestion: "Envie sem imagens: e-mail pessoal quase nunca traz arte embutida.",
    });
  }

  if (images / paragraphs > 0.5) {
    findings.push({
      id: "proporcao-imagem",
      area: "midia",
      weight: 10,
      title: "Proporção alta de imagens por parágrafo",
      suggestion:
        "Aumente o texto ou remova imagens até ter no máximo 1 imagem a cada 3 parágrafos.",
    });
  }

  if (links > 2) {
    findings.push({
      id: "links",
      area: "midia",
      weight: links >= 5 ? 16 : 9,
      title: `${links} links no corpo`,
      suggestion: "Deixe apenas um link, dentro de uma frase natural.",
    });
  }

  if (/utm_|\/track\/|click\.|redirect\?/i.test(body)) {
    findings.push({
      id: "rastreio",
      area: "midia",
      weight: 10,
      title: "Links com parâmetros de rastreio",
      suggestion: "Use a URL limpa; o rastreio reescrito é lido como marketing.",
    });
  }

  const score = Math.min(
    100,
    findings.reduce((total, finding) => total + finding.weight, 0),
  );
  const level: SpamLevel = score >= 45 ? "alto" : score >= 18 ? "medio" : "baixo";

  return { score, level, findings };
}

export const SPAM_LEVEL_LABEL: Record<SpamLevel, string> = {
  baixo: "Risco baixo",
  medio: "Risco médio",
  alto: "Risco alto",
};
