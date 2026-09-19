CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Campanha sem nome',
  objective text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own marketing campaigns"
ON public.marketing_campaigns FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_marketing_campaigns_updated_at
BEFORE UPDATE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.campaigns
  ADD COLUMN marketing_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.email_link_tracks
  ADD COLUMN marketing_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;

CREATE INDEX idx_email_link_tracks_marketing ON public.email_link_tracks(marketing_campaign_id);
CREATE INDEX idx_campaigns_marketing ON public.campaigns(marketing_campaign_id);