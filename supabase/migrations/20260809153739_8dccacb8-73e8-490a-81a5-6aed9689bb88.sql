CREATE TABLE public.csv_row_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  csv_row_id uuid NOT NULL REFERENCES public.csv_rows(id) ON DELETE CASCADE,
  run_id uuid,
  from_status public.csv_row_status,
  to_status public.csv_row_status NOT NULL,
  is_personalized boolean,
  site_ok boolean,
  site_reason text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.csv_row_events TO authenticated;
GRANT ALL ON public.csv_row_events TO service_role;

ALTER TABLE public.csv_row_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own csv row events"
ON public.csv_row_events FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_csv_row_events_row ON public.csv_row_events (csv_row_id, created_at DESC);
CREATE INDEX idx_csv_row_events_run ON public.csv_row_events (user_id, run_id, created_at DESC);