import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignLinkTracking = {
  id: string;
  recipient_email: string;
  destination_url: string;
  click_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
  created_at: string;
};

export type CampaignLinkTrackingResult = {
  configured: boolean;
  links: CampaignLinkTracking[];
};

export const listCampaignLinkTracking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data, context }): Promise<CampaignLinkTrackingResult> => {
    const configured = (process.env["TRACKING_ORIGIN"] ?? "").trim().startsWith("https://");
    const { data: rows, error } = await (context.supabase as any)
      .from("email_link_tracks")
      .select(
        "id,recipient_email,destination_url,click_count,first_clicked_at,last_clicked_at,created_at",
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return { configured, links: (rows ?? []) as CampaignLinkTracking[] };
  });
