ALTER TABLE public.csv_rows
  ADD COLUMN IF NOT EXISTS research jsonb,
  ADD COLUMN IF NOT EXISTS research_sources jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.csv_row_events
  ADD COLUMN IF NOT EXISTS research_ok boolean,
  ADD COLUMN IF NOT EXISTS research_sources_count integer;