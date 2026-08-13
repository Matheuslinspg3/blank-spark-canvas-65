ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS queue jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_send_at timestamptz;

CREATE TABLE IF NOT EXISTS public.cron_config (
  id integer PRIMARY KEY DEFAULT 1,
  dispatch_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_config TO service_role;
ALTER TABLE public.cron_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cron_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_secret text;
  v_url text;
BEGIN
  SELECT dispatch_secret INTO v_secret FROM public.cron_config WHERE id = 1;
  v_url := 'https://project--7b73e4df-5b75-434e-ab8b-74c2e10c0428.lovable.app/api/public/cron/dispatch?s=' || v_secret;

  PERFORM cron.unschedule('dispatch-scheduled-campaigns')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-scheduled-campaigns');

  PERFORM cron.schedule(
    'dispatch-scheduled-campaigns',
    '* * * * *',
    format($cmd$select net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb) $cmd$, v_url)
  );
END $$;