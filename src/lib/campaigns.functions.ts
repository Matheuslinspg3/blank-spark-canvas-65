import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Campaign, CampaignPatch } from "./campaigns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

type SupabaseOperationResult<T> = {
  data: T;
  error: { message: string } | null;
};

async function runUserScopedOperation<T>(
  client: LooseClient,
  operation: (scopedClient: LooseClient) => PromiseLike<SupabaseOperationResult<T>>,
): Promise<SupabaseOperationResult<T>> {
  let result = await operation(client);
  if (result.error && /jwt issued at future/i.test(result.error.message)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    result = await operation(supabaseAdmin as unknown as LooseClient);
  }
  return result;
}

// Lista leve: não traz fila, resultados, destinatários nem HTML (que em disparos
// grandes somam vários MB e estouravam o tempo limite do banco).
const LIST_COLUMNS =
  "id, user_id, name, status, mode, sender_name, sender_email, subject, total_count, sent_count, started_at, finished_at, created_at, updated_at, schedule, next_send_at, marketing_campaign_id, paused, daily_sent_count, daily_sent_date";

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const run = (client: LooseClient) =>
      client
        .from("campaigns")
        .select(LIST_COLUMNS)
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false });

    const { data, error } = await runUserScopedOperation(
      context.supabase as unknown as LooseClient,
      run,
    );
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      brief: "",
      html_template: "",
      recipients: [],
      results: [],
      reviews: {},
      chat: [],
      queue: [],
      ...row,
    })) as unknown as Campaign[];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { data: row, error } = await runUserScopedOperation(supabase, (client) =>
      client
        .from("campaigns")
        .select("*")
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle(),
    );
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Disparo não encontrado.");
    return row as unknown as Campaign;
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { name?: string; mode?: "completo" | "simples" | "molde" | "ia" }) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    const allowed = ["simples", "molde", "ia"] as const;
    const mode = allowed.find((value) => value === data.mode) ?? "completo";
    const prefix =
      mode === "simples"
        ? "Disparo simples"
        : mode === "molde"
          ? "Disparo com molde"
          : mode === "ia"
            ? "Disparo por IA"
            : "Disparo";
    const supabase = context.supabase as unknown as LooseClient;
    const { data: row, error } = await runUserScopedOperation(supabase, (client) =>
      client
        .from("campaigns")
        .insert({
          user_id: context.userId,
          name: data.name?.trim() || `${prefix} ${new Date().toLocaleString("pt-BR")}`,
          status: "rascunho",
          mode,
        })
        .select("*")
        .single(),
    );
    if (error) throw new Error(error.message);
    return row as unknown as Campaign;
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; patch: CampaignPatch }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { data: row, error } = await runUserScopedOperation(supabase, (client) =>
      client
        .from("campaigns")
        .update(data.patch)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single(),
    );
    if (error) throw new Error(error.message);
    return row as unknown as Campaign;
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { error } = await runUserScopedOperation(supabase, (client) =>
      client.from("campaigns").delete().eq("id", data.id).eq("user_id", context.userId),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
