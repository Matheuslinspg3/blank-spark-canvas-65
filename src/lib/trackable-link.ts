/**
 * Verificação obrigatória de link rastreável: todo e-mail precisa ter pelo
 * menos um link http/https, porque é ele que vira o /r/<código> único por
 * destinatário. Sem link, não há clique para rastrear.
 */

const LINK_RE = /https?:\/\/[^\s"'<>)]+/i;

/** True quando o conteúdo tem ao menos um endereço http/https clicável. */
export function hasTrackableLink(...contents: (string | null | undefined)[]): boolean {
  return contents.some((content) => typeof content === "string" && LINK_RE.test(content));
}

export const NO_LINK_MESSAGE =
  'Este e-mail não tem nenhum link (http/https). Inclua pelo menos um link — ele vira um endereço único por destinatário para rastrear o clique. Use o botão "Criar link rastreado".';

/** Lança erro em português quando nenhum conteúdo tem link rastreável. */
export function requireTrackableLink(...contents: (string | null | undefined)[]): void {
  if (!hasTrackableLink(...contents)) throw new Error(NO_LINK_MESSAGE);
}
