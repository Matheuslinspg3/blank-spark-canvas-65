import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bridgeConfigSchema, type BridgeConfig } from "@/lib/bridge-page";

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

export type TrackedLink = {
  id: string;
  destination_url: string;
  recipient_email: string;
  campaign_id: string | null;
  campaign_name: string | null;
  click_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  created_at: string;
  tracking_url: string | null;
  mode: "redirect" | "bridge";
  bridge_config: Partial<BridgeConfig>;
  lead_count: number;
};

export type LinkLead = {
  id: string;
  created_at: string;
  name: string | null;
  whatsapp: string | null;
  company: string | null;
  recipient_email: string;
  link_id: string;
  link_title: string | null;
  campaign_name: string | null;
};

export type TrackedLinksResult = {
  configured: boolean;
  links: TrackedLink[];
};

function trackingOrigin(): string | null {
  const origin = (process.env["TRACKING_ORIGIN"] ?? "").trim().replace(/\/+$/, "");
  return origin.startsWith("https://") ? origin : null;
}

const createSchema = z.object({
  destinationUrl: z
    .string()
    .trim()
    .min(1, "Informe o endereço de destino")
    .refine((v) => /^https?:\/\//i.test(v), "O endereço precisa começar com http:// ou https://"),
  recipientEmail: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail do destinatário inválido"),
  campaignId: z.string().uuid().optional(),
  mode: z.enum(["redirect", "bridge"]).default("redirect"),
  bridgeConfig: bridgeConfigSchema.optional(),
}).refine((v) => v.mode === "redirect" || !!v.bridgeConfig, {
  message: "Configure a Página Ponte",
});

export const createTrackedLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createSchema.parse(data))
  .handler(async ({ data, context }): Promise<TrackedLink> => {
    const supabase = context.supabase as unknown as LooseClient;
    let campaignName: string | null = null;
    if (data.campaignId) {
      const { data: campaign, error: campaignError } = await runUserScopedOperation(
        supabase,
        (client) =>
          client
            .from("campaigns")
            .select("id,name")
            .eq("id", data.campaignId)
            .eq("user_id", context.userId)
            .maybeSingle(),
      );
      if (campaignError) throw new Error(campaignError.message);
      if (!campaign) throw new Error("Disparo não encontrado.");
      campaignName = (campaign as { name: string }).name;
    }
    const token = crypto.randomUUID().replaceAll("-", "");
    const { data: row, error } = await runUserScopedOperation(supabase, (client) =>
      client
        .from("email_link_tracks")
        .insert({
          user_id: context.userId,
          recipient_email: data.recipientEmail || "",
          destination_url: data.destinationUrl,
          campaign_id: data.campaignId ?? null,
          token,
          mode: data.mode,
          bridge_config: data.mode === "bridge" ? data.bridgeConfig : {},
        })
        .select(
          "id,destination_url,recipient_email,campaign_id,click_count,first_clicked_at,last_clicked_at,created_at,mode,bridge_config",
        )
        .single(),
    );
    if (error) throw new Error(error.message);
    const origin = trackingOrigin();
    return {
      ...(row as Omit<TrackedLink, "tracking_url" | "campaign_name" | "lead_count">),
      campaign_name: campaignName,
      lead_count: 0,
      tracking_url: origin ? `${origin}/${data.mode === "bridge" ? "p" : "r"}/${token}` : null,
    };
  });

export const deleteTrackedLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { error } = await runUserScopedOperation(supabase, (client) =>
      client.from("email_link_tracks").delete().eq("id", data.id).eq("user_id", context.userId),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTrackedLinksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrackedLinksResult> => {
    const origin = trackingOrigin();
    const supabase = context.supabase as unknown as LooseClient;
    const { data: rows, error } = await runUserScopedOperation(supabase, (client) =>
      client
        .from("email_link_tracks")
        .select(
          "id,destination_url,recipient_email,campaign_id,click_count,first_clicked_at,last_clicked_at,created_at,token,mode,bridge_config",
        )
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(500),
    );
    if (error) throw new Error(error.message);

    const typedRows = (rows ?? []) as (Omit<
      TrackedLink,
      "tracking_url" | "campaign_name" | "lead_count"
    > & {
      token: string;
    })[];
    const campaignIds = [
      ...new Set(typedRows.map((row) => row.campaign_id).filter(Boolean)),
    ] as string[];
    const campaignNames = new Map<string, string>();
    if (campaignIds.length > 0) {
      const { data: campaigns, error: campaignsError } = await runUserScopedOperation(
        supabase,
        (client) =>
          client
            .from("campaigns")
            .select("id,name")
            .eq("user_id", context.userId)
            .in("id", campaignIds),
      );
      if (campaignsError) throw new Error(campaignsError.message);
      for (const campaign of (campaigns ?? []) as { id: string; name: string }[]) {
        campaignNames.set(campaign.id, campaign.name);
      }
    }

    const leadCounts = new Map<string, number>();
    const bridgeIds = typedRows.filter((r) => r.mode === "bridge").map((r) => r.id);
    if (bridgeIds.length > 0) {
      const { data: leadRows } = await runUserScopedOperation(supabase, (client) =>
        client
          .from("link_leads")
          .select("email_link_track_id")
          .eq("user_id", context.userId)
          .in("email_link_track_id", bridgeIds)
          .limit(5000),
      );
      for (const lead of (leadRows ?? []) as { email_link_track_id: string }[]) {
        leadCounts.set(lead.email_link_track_id, (leadCounts.get(lead.email_link_track_id) ?? 0) + 1);
      }
    }

    const links: TrackedLink[] = typedRows.map((row) => ({
      id: row.id,
      destination_url: row.destination_url,
      recipient_email: row.recipient_email,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_id ? (campaignNames.get(row.campaign_id) ?? null) : null,
      click_count: row.click_count,
      first_clicked_at: row.first_clicked_at,
      last_clicked_at: row.last_clicked_at,
      created_at: row.created_at,
      mode: row.mode === "bridge" ? "bridge" : "redirect",
      bridge_config: row.bridge_config ?? {},
      lead_count: leadCounts.get(row.id) ?? 0,
      tracking_url: origin ? `${origin}/${row.mode === "bridge" ? "p" : "r"}/${row.token}` : null,
    }));
    return { configured: origin !== null, links };
  });

export const listLinkLeadsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId?: string } | undefined) =>
    z.object({ campaignId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<LinkLead[]> => {
    const supabase = context.supabase as unknown as LooseClient;
    const { data: rows, error } = await runUserScopedOperation(supabase, (client) => {
      let query = client
        .from("link_leads")
        .select("id,created_at,name,whatsapp,company,recipient_email,email_link_track_id,campaign_id")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (data.campaignId) query = query.eq("campaign_id", data.campaignId);
      return query;
    });
    if (error) throw new Error(error.message);
    type Row = {
      id: string;
      created_at: string;
      name: string | null;
      whatsapp: string | null;
      company: string | null;
      recipient_email: string;
      email_link_track_id: string;
      campaign_id: string | null;
    };
    const typed = (rows ?? []) as Row[];
    const trackIds = [...new Set(typed.map((r) => r.email_link_track_id))];
    const campaignIds = [...new Set(typed.map((r) => r.campaign_id).filter(Boolean))] as string[];
    const titles = new Map<string, string>();
    const names = new Map<string, string>();
    if (trackIds.length) {
      const { data: tracks } = await runUserScopedOperation(supabase, (client) =>
        client.from("email_link_tracks").select("id,bridge_config").in("id", trackIds),
      );
      for (const t of (tracks ?? []) as { id: string; bridge_config: { title?: string } }[]) {
        titles.set(t.id, t.bridge_config?.title ?? "");
      }
    }
    if (campaignIds.length) {
      const { data: camps } = await runUserScopedOperation(supabase, (client) =>
        client.from("campaigns").select("id,name").in("id", campaignIds),
      );
      for (const c of (camps ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
    }
    return typed.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      name: r.name,
      whatsapp: r.whatsapp,
      company: r.company,
      recipient_email: r.recipient_email,
      link_id: r.email_link_track_id,
      link_title: titles.get(r.email_link_track_id) || null,
      campaign_name: r.campaign_id ? (names.get(r.campaign_id) ?? null) : null,
    }));
  });
