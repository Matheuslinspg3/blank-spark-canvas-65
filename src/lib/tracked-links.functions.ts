import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrackedLink = {
  id: string;
  destination_url: string;
  recipient_email: string;
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
  recipientEmail: z.string().trim().optional(),
});

export const createTrackedLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => createSchema.parse(data))
  .handler(async ({ data, context }): Promise<TrackedLink> => {
    const token = crypto.randomUUID().replaceAll("-", "");
    const { data: row, error } = await context.supabase
      .from("email_link_tracks")
      .insert({
        user_id: context.userId,
        recipient_email: data.recipientEmail || "",
        destination_url: data.destinationUrl,
        token,
      })
      .select(
        "id,destination_url,recipient_email,click_count,first_clicked_at,last_clicked_at,created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    const origin = trackingOrigin();
    return {
      ...(row as Omit<TrackedLink, "tracking_url">),
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
        "id,destination_url,recipient_email,click_count,first_clicked_at,last_clicked_at,created_at,token",
      )
      .is("campaign_id", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const links: TrackedLink[] = (rows ?? []).map((row: any) => ({
      id: row.id,
      destination_url: row.destination_url,
      recipient_email: row.recipient_email,
      click_count: row.click_count,
      first_clicked_at: row.first_clicked_at,
      last_clicked_at: row.last_clicked_at,
      created_at: row.created_at,
      tracking_url: origin ? `${origin}/r/${row.token}` : null,
    }));
    return { configured: origin !== null, links };
  });
