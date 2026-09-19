import type { SupabaseClient } from "@supabase/supabase-js";

import type { Recipient } from "./bulk-email";

type Client = SupabaseClient<any, any, any>;

export type EmailTrackingContext = {
  supabase: Client;
  userId: string;
  campaignId?: string | null | undefined;
  /** Preenchido automaticamente a partir do disparo (campanha de marketing vinculada). */
  marketingCampaignId?: string | null | undefined;
};

/** Descobre (uma vez por envio) a campanha vinculada ao disparo. */
async function resolveMarketingCampaignId(context: EmailTrackingContext): Promise<string | null> {
  if (context.marketingCampaignId !== undefined) return context.marketingCampaignId ?? null;
  if (!context.campaignId) {
    context.marketingCampaignId = null;
    return null;
  }
  const { data } = await context.supabase
    .from("campaigns")
    .select("marketing_campaign_id")
    .eq("id", context.campaignId)
    .maybeSingle();
  const value = (data as { marketing_campaign_id?: string | null } | null)?.marketing_campaign_id ?? null;
  context.marketingCampaignId = value;
  return value;
}

export type TrackedHtml = { html: string; trackingLinkIds: string[] };

function trackingOrigin(): string | null {
  const value = (process.env["TRACKING_ORIGIN"] ?? "").trim();
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function validDestination(value: string) {
  try {
    const url = new URL(value.replace(/&amp;/g, "&"));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Replaces only HTTP(S) anchors; mailto, fragments and template syntax stay untouched. */
export async function createTrackedHtml(
  html: string,
  recipient: Recipient,
  context: EmailTrackingContext | undefined,
): Promise<TrackedHtml> {
  const origin = trackingOrigin();
  const email = String(recipient["email"] ?? "").trim().toLowerCase();
  if (!context || !origin || !email || !html.includes("href")) return { html, trackingLinkIds: [] };

  const anchorRe = /(<a\b[^>]*?\bhref=(["']))(.*?)(\2[^>]*>)/gi;
  const records: { id: string; destinationUrl: string; token: string }[] = [];
  for (const match of [...html.matchAll(anchorRe)]) {
    const destinationUrl = validDestination(match[3] ?? "");
    if (!destinationUrl) continue;
    const token = crypto.randomUUID().replaceAll("-", "");
    const { data, error } = await context.supabase
      .from("email_link_tracks")
      .insert({
        user_id: context.userId,
        campaign_id: context.campaignId ?? null,
        recipient_email: email,
        destination_url: destinationUrl,
        token,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(`Não foi possível preparar o link rastreável: ${error.message}`);
    records.push({ id: (data as { id: string }).id, destinationUrl, token });
  }

  let cursor = 0;
  const tracked = html.replace(anchorRe, (full, prefix: string, _quote: string, href: string, suffix: string) => {
    const destinationUrl = validDestination(String(href));
    if (!destinationUrl) return full;
    const record = records[cursor++];
    if (!record || record.destinationUrl !== destinationUrl) return full;
    return `${prefix}${origin}/r/${record.token}${suffix}`;
  });
  return { html: tracked, trackingLinkIds: records.map((record) => record.id) };
}

export async function attachTracksToEmailEvent(
  supabase: Client,
  userId: string,
  emailEventId: string,
  trackingLinkIds: string[] | undefined,
) {
  if (!trackingLinkIds?.length) return;
  const { error } = await supabase
    .from("email_link_tracks")
    .update({ email_event_id: emailEventId } as any)
    .eq("user_id", userId)
    .in("id", trackingLinkIds);
  if (error) console.error(`[tracking] falha ao vincular evento: ${error.message}`);
}
