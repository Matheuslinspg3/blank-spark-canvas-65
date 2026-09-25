import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  bridgeConfigSchema,
  fillDestination,
  isValidBrPhone,
  onlyDigits,
  type BridgeConfig,
} from "@/lib/bridge-page";

const tokenSchema = z.string().regex(/^[A-Za-z0-9]{24,64}$/);

type TrackRow = {
  id: string;
  user_id: string;
  campaign_id: string | null;
  marketing_campaign_id: string | null;
  recipient_email: string;
  destination_url: string;
  is_active: boolean;
  expires_at: string | null;
  mode: string;
  bridge_config: unknown;
};

async function loadTrack(token: string): Promise<TrackRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;
  const { data } = await admin
    .from("email_link_tracks")
    .select(
      "id,user_id,campaign_id,marketing_campaign_id,recipient_email,destination_url,is_active,expires_at,mode,bridge_config",
    )
    .eq("token", token)
    .maybeSingle();
  const track = data as TrackRow | null;
  if (!track || !track.is_active || track.mode !== "bridge") return null;
  if (track.expires_at && new Date(track.expires_at) <= new Date()) return null;
  return track;
}

async function recordVisit(trackId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data } = await admin
      .from("email_link_tracks")
      .select("click_count,first_clicked_at")
      .eq("id", trackId)
      .single();
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("email_link_click_events").insert({ email_link_track_id: trackId }),
      admin
        .from("email_link_tracks")
        .update({
          click_count: Number(data?.click_count || 0) + 1,
          first_clicked_at: data?.first_clicked_at ?? now,
          last_clicked_at: now,
        })
        .eq("id", trackId),
    ]);
  } catch {
    /* visit metadata is best-effort; no IP/location stored */
  }
}

/** Public: returns only the visual configuration — never e-mails or ids. */
export const getBridgePageFn = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => z.object({ token: tokenSchema }).parse(data))
  .handler(async ({ data }): Promise<BridgeConfig | null> => {
    const track = await loadTrack(data.token);
    if (!track) return null;
    await recordVisit(track.id);
    const parsed = bridgeConfigSchema.safeParse(track.bridge_config);
    return parsed.success ? parsed.data : null;
  });

const leadSchema = z.object({
  token: tokenSchema,
  name: z.string().trim().max(120).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  company: z.string().trim().max(160).optional(),
});

export const submitBridgeLeadFn = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof leadSchema>) => leadSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true; redirectUrl: string } | { ok: false; error: string }> => {
    const track = await loadTrack(data.token);
    if (!track) return { ok: false, error: "Este link não está mais disponível." };
    const config = bridgeConfigSchema.safeParse(track.bridge_config);
    if (!config.success) return { ok: false, error: "Página indisponível." };
    const fields = config.data.fields;
    if (fields.includes("name") && !data.name) return { ok: false, error: "Informe seu nome." };
    if (fields.includes("company") && !data.company)
      return { ok: false, error: "Informe sua empresa." };
    if (fields.includes("whatsapp") && (!data.whatsapp || !isValidBrPhone(data.whatsapp)))
      return { ok: false, error: "Informe um WhatsApp válido com DDD." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { error } = await admin.from("link_leads").insert({
      user_id: track.user_id,
      email_link_track_id: track.id,
      campaign_id: track.campaign_id,
      marketing_campaign_id: track.marketing_campaign_id,
      recipient_email: track.recipient_email ?? "",
      name: fields.includes("name") ? data.name : null,
      whatsapp: fields.includes("whatsapp") && data.whatsapp ? onlyDigits(data.whatsapp) : null,
      company: fields.includes("company") ? data.company : null,
    });
    if (error) {
      console.error("link_leads insert failed", error.message);
      return { ok: false, error: "Não foi possível enviar agora. Tente novamente." };
    }
    let redirectUrl: string;
    try {
      redirectUrl = fillDestination(track.destination_url, {
        name: data.name ?? "",
        whatsapp: data.whatsapp ?? "",
        company: data.company ?? "",
      });
    } catch {
      return { ok: false, error: "Destino inválido." };
    }
    if (!/^https?:\/\//i.test(redirectUrl)) return { ok: false, error: "Destino inválido." };
    return { ok: true, redirectUrl };
  });
