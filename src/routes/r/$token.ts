import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Links already sent in older campaigns may reference tokens that no longer
// exist in the database. Instead of a dead page, send those visitors to the
// main CAFCM site so the e-mail links keep working.
const FALLBACK_DESTINATION =
  "https://api.whatsapp.com/send/?phone=5513997138381&text=Ol%C3%A1%2C%20Recebi%20o%20e-mail%20da%20CAFCM%20e%20quero%20entender%20melhor%20o%20Programa%20Melhor%20Aprendiz.&type=phone_number&app_absent=0";

function unavailable() {
  return Response.redirect(FALLBACK_DESTINATION, 302);
}

export const Route = createFileRoute("/r/$token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // This public route deliberately uses the server-only client; the visitor
        // never receives a database row or an API key.
        const admin = supabaseAdmin as any;
        const token = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
        if (!/^[A-Za-z0-9]{24,64}$/.test(token)) return unavailable();
        const { data: track } = await admin
          .from("email_link_tracks")
          .select("id,destination_url,is_active,expires_at,click_count,first_clicked_at,mode")
          .eq("token", token)
          .maybeSingle();
        if (
          !track ||
          !track.is_active ||
          (track.expires_at && new Date(track.expires_at) <= new Date())
        )
          return unavailable();
        let destination: URL;
        try {
          destination = new URL(track.destination_url);
        } catch {
          return unavailable();
        }
        if (!/^https?:$/.test(destination.protocol)) return unavailable();
        if (track.mode === "bridge") {
          return Response.redirect(new URL(`/p/${token}`, request.url).toString(), 302);
        }

        let referrerOrigin: string | null = null;
        try {
          referrerOrigin = new URL(request.headers.get("referer") ?? "").origin;
        } catch {
          /* optional metadata */
        }
        const now = new Date().toISOString();
        // Event recording is intentionally small and never includes IP, location or fingerprinting.
        await Promise.all([
          admin.from("email_link_click_events").insert({
            email_link_track_id: track.id,
            referrer_origin: referrerOrigin,
            user_agent: (request.headers.get("user-agent") ?? "").slice(0, 400) || null,
          }),
          admin
            .from("email_link_tracks")
            .update({
              click_count: Number(track.click_count || 0) + 1,
              first_clicked_at: track.first_clicked_at ?? now,
              last_clicked_at: now,
            })
            .eq("id", track.id),
        ]).catch(() => undefined);
        return Response.redirect(destination.toString(), 302);
      },
    },
  },
});
