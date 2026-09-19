import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function unavailable() {
  return new Response("Este link não está mais disponível.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
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
          .select("id,destination_url,is_active,expires_at,click_count,first_clicked_at")
          .eq("token", token)
          .maybeSingle();
        if (!track || !track.is_active || (track.expires_at && new Date(track.expires_at) <= new Date())) return unavailable();
        let destination: URL;
        try { destination = new URL(track.destination_url); } catch { return unavailable(); }
        if (!/^https?:$/.test(destination.protocol)) return unavailable();

        let referrerOrigin: string | null = null;
        try { referrerOrigin = new URL(request.headers.get("referer") ?? "").origin; } catch { /* optional metadata */ }
        const now = new Date().toISOString();
        // Event recording is intentionally small and never includes IP, location or fingerprinting.
        await Promise.all([
          admin.from("email_link_click_events").insert({ email_link_track_id: track.id, referrer_origin: referrerOrigin, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 400) || null }),
          admin.from("email_link_tracks").update({ click_count: Number(track.click_count || 0) + 1, first_clicked_at: track.first_clicked_at ?? now, last_clicked_at: now }).eq("id", track.id),
        ]).catch(() => undefined);
        return Response.redirect(destination.toString(), 302);
      },
    },
  },
});
