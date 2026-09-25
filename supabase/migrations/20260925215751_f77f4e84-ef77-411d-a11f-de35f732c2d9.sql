ALTER TABLE public.email_link_tracks ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'redirect', ADD COLUMN IF NOT EXISTS bridge_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.link_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_link_track_id uuid NOT NULL REFERENCES public.email_link_tracks(id) ON DELETE CASCADE,
  campaign_id uuid,
  marketing_campaign_id uuid,
  recipient_email text NOT NULL DEFAULT '',
  name text,
  whatsapp text,
  company text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.link_leads TO authenticated;
GRANT ALL ON public.link_leads TO service_role;
ALTER TABLE public.link_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read leads" ON public.link_leads FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners delete leads" ON public.link_leads FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE INDEX link_leads_track_idx ON public.link_leads(email_link_track_id);
CREATE INDEX link_leads_user_idx ON public.link_leads(user_id, created_at DESC);