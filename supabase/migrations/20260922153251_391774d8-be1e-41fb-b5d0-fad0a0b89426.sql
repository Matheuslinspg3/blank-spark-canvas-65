ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS send_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_sent_date date,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;