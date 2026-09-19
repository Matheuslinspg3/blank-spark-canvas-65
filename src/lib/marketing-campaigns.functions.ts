import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CampaignLink,
  MarketingCampaign,
  MarketingCampaignWithStats,
} from "./marketing-campaigns";

const linkSchema = z.object({
  label: z.string().trim().max(120).default(""),
  url: z
    .string()
    .trim()
    .refine((v) => /^https?:\/\//i.test(v), "O endereço precisa começar com http:// ou https://"),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1, "Dê um nome à campanha").max(160).optional(),
    objective: z.string().trim().max(2000).optional(),
    audience: z.string().trim().max(2000).optional(),
    links: z.array(linkSchema).max(50).optional(),
  }),
});

function rowToCampaign(row: Record<string, unknown>): MarketingCampaign {
  return {
    id: row["id"] as string,
    user_id: row["user_id"] as string,
    name: row["name"] as string,
    objective: (row["objective"] as string) ?? "",
    audience: (row["audience"] as string) ?? "",
    links: (Array.isArray(row["links"]) ? row["links"] : []) as CampaignLink[],
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

export const listMarketingCampaignsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketingCampaignWithStats[]> => {
    const supabase = context.supabase as unknown as {
      from: (table: string) => any;
    };
    const { data: rows, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const campaigns = ((rows ?? []) as Record<string, unknown>[]).map(rowToCampaign);
    if (campaigns.length === 0) return [];

    const ids = campaigns.map((campaign) => campaign.id);
    const { data: tracks } = await supabase
      .from("email_link_tracks")
      .select("marketing_campaign_id,recipient_email,click_count")
      .in("marketing_campaign_id", ids)
      .limit(5000);
    const { data: dispatches } = await supabase
      .from("campaigns")
      .select("id,marketing_campaign_id")
      .in("marketing_campaign_id", ids);

    return campaigns.map((campaign) => {
      const own = ((tracks ?? []) as {
        marketing_campaign_id: string;
        recipient_email: string;
        click_count: number;
      }[]).filter((track) => track.marketing_campaign_id === campaign.id);
      const clicked = new Set(
        own.filter((track) => track.click_count > 0).map((track) => track.recipient_email),
      );
      return {
        ...campaign,
        stats: {
          trackedLinks: own.length,
          clickedRecipients: clicked.size,
          totalClicks: own.reduce((sum, track) => sum + (track.click_count ?? 0), 0),
          dispatches: ((dispatches ?? []) as { marketing_campaign_id: string }[]).filter(
            (row) => row.marketing_campaign_id === campaign.id,
          ).length,
        },
      };
    });
  });

export const createMarketingCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name?: string }) =>
    z.object({ name: z.string().trim().max(160).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<MarketingCampaign> => {
    const supabase = context.supabase as unknown as { from: (table: string) => any };
    const { data: row, error } = await supabase
      .from("marketing_campaigns")
      .insert({
        user_id: context.userId,
        name: data.name?.trim() || `Campanha ${new Date().toLocaleDateString("pt-BR")}`,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToCampaign(row as Record<string, unknown>);
  });

export const updateMarketingCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => patchSchema.parse(data))
  .handler(async ({ data, context }): Promise<MarketingCampaign> => {
    const supabase = context.supabase as unknown as { from: (table: string) => any };
    const { data: row, error } = await supabase
      .from("marketing_campaigns")
      .update(data.patch)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToCampaign(row as Record<string, unknown>);
  });

export const deleteMarketingCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as { from: (table: string) => any };
    const { error } = await supabase
      .from("marketing_campaigns")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Vincula (ou desvincula) um disparo a uma campanha. */
export const linkDispatchToCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { dispatchId: string; marketingCampaignId: string | null }) =>
    z
      .object({
        dispatchId: z.string().uuid(),
        marketingCampaignId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as { from: (table: string) => any };
    const { error } = await supabase
      .from("campaigns")
      .update({ marketing_campaign_id: data.marketingCampaignId })
      .eq("id", data.dispatchId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
