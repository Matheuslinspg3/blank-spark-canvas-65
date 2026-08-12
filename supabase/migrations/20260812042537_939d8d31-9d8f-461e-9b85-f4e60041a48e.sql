CREATE TYPE public.email_event_status AS ENUM ('enviado','entregue','bounce_hard','bounce_soft','spam','bloqueado','invalido','erro');
CREATE TYPE public.suppression_reason AS ENUM ('bounce','spam','invalido','manual');

CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  email text NOT NULL,
  message_id text,
  status public.email_event_status NOT NULL DEFAULT 'enviado',
  reason text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  updated_status_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own email events" ON public.email_events
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX email_events_user_sent_idx ON public.email_events (user_id, sent_at DESC);
CREATE INDEX email_events_campaign_idx ON public.email_events (campaign_id);
CREATE INDEX email_events_message_idx ON public.email_events (message_id);

CREATE TRIGGER update_email_events_updated_at BEFORE UPDATE ON public.email_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason public.suppression_reason NOT NULL DEFAULT 'manual',
  source text NOT NULL DEFAULT '',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppressions TO authenticated;
GRANT ALL ON public.suppressions TO service_role;
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own suppressions" ON public.suppressions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX suppressions_user_email_idx ON public.suppressions (user_id, email);

CREATE TRIGGER update_suppressions_updated_at BEFORE UPDATE ON public.suppressions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();