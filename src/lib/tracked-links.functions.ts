import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
});

export const createTrackedLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createSchema.parse(data))
  .handler(async ({ data, context }): Promise<TrackedLink> => {
    let campaignName: string | null = null;
    if (data.campaignId) {
      const { data: campaign, error: campaignError } = await context.supabase
        .from("campaigns")
        .select("id,name")
        .eq("id", data.campaignId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (campaignError) throw new Error(campaignError.message);
      if (!campaign) throw new Error("Disparo não encontrado.");
      campaignName = campaign.name;
    }
    const token = crypto.randomUUID().replaceAll("-", "");
    const { data: row, error } = await context.supabase
      .from("email_link_tracks")
      .insert({
        user_id: context.userId,
        recipient_email: data.recipientEmail || "",
        destination_url: data.destinationUrl,
        campaign_id: data.campaignId ?? null,
        token,
      })
      .select(
        "id,destination_url,recipient_email,campaign_id,click_count,first_clicked_at,last_clicked_at,created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    const origin = trackingOrigin();
    return {
      ...(row as Omit<TrackedLink, "tracking_url" | "campaign_name">),
      campaign_name: campaignName,
      tracking_url: origin ? `${origin}/r/${token}` : null,
    };
  });

export const deleteTrackedLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_link_tracks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTrackedLinksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrackedLinksResult> => {
    const origin = trackingOrigin();
    const { data: rows, error } = await context.supabase
      .from("email_link_tracks")
      .select(
        "id,destination_url,recipient_email,campaign_id,click_count,first_clicked_at,last_clicked_at,created_at,token",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const campaignIds = [
      ...new Set((rows ?? []).map((r) => r.campaign_id).filter(Boolean)),
    ] as string[];
    const campaignNames = new Map<string, string>();
    if (campaignIds.length > 0) {
      const { data: campaigns } = await context.supabase
        .from("campaigns")
        .select("id,name")
        .in("id", campaignIds);
      for (const c of campaigns ?? []) campaignNames.set(c.id, c.name);
    }

    const links: TrackedLink[] = (rows ?? []).map((row) => ({
      id: row.id,
      destination_url: row.destination_url,
      recipient_email: row.recipient_email,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_id ? (campaignNames.get(row.campaign_id) ?? null) : null,
      click_count: row.click_count,
      first_clicked_at: row.first_clicked_at,
      last_clicked_at: row.last_clicked_at,
      created_at: row.created_at,
      tracking_url: origin ? `${origin}/r/${row.token}` : null,
    }));
    return { configured: origin !== null, links };
  });
