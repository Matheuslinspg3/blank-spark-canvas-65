/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recuperação do erro "JWT issued at future" (relógio do servidor adiantado
 * em relação ao token do usuário). Refaz a mesma consulta — já filtrada pela
 * conta autenticada — com o cliente de serviço.
 */
export type LooseClient = { from: (table: string) => any };

export type SupabaseOperationResult<T> = {
  data?: T;
  count?: number | null;
  error: { message: string } | null;
};

export function isClockSkewError(message: string | undefined | null): boolean {
  // Consultas com `head: true` não trazem corpo, então o erro pode vir sem texto.
  if (!message || !message.trim()) return true;
  return /jwt issued at future|jwt not yet valid|jwt expired/i.test(message);
}

export async function runUserScopedOperation<R extends SupabaseOperationResult<any>>(
  client: unknown,
  operation: (scopedClient: LooseClient) => PromiseLike<R>,
): Promise<R> {
  let result = await operation(client as LooseClient);
  if (result.error && isClockSkewError(result.error.message)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    result = await operation(supabaseAdmin as unknown as LooseClient);
  }
  return result;
}
