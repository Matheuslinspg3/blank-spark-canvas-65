import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Campaign, CampaignPatch } from "./campaigns";

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let { data, error } = await context.supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error && /jwt issued at future/i.test(error.message)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      ({ data, error } = await supabaseAdmin
        .from("campaigns")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }));
    }

    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Campaign[];
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Disparo não encontrado.");
    return row as unknown as Campaign;
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name?: string; mode?: "completo" | "simples" | "molde" | "ia" }) => input ?? {})
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
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .insert({
        user_id: context.userId,
        name: data.name?.trim() || `${prefix} ${new Date().toLocaleString("pt-BR")}`,
        status: "rascunho",
        mode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as Campaign;
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; patch: CampaignPatch }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("campaigns")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data.patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as Campaign;
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
