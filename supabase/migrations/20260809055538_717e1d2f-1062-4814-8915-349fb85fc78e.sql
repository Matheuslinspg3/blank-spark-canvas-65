CREATE TYPE public.csv_row_status AS ENUM ('pendente','processando','gerado','erro');

CREATE TABLE public.csv_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL,
  categoria text NOT NULL DEFAULT '',
  status public.csv_row_status NOT NULL DEFAULT 'pendente',
  site_content text,
  generated_email text,
  is_personalized boolean NOT NULL DEFAULT false,
  approved boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.csv_rows TO authenticated;
GRANT ALL ON public.csv_rows TO service_role;

ALTER TABLE public.csv_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own csv rows"
ON public.csv_rows FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX csv_rows_user_status_idx ON public.csv_rows (user_id, status);

CREATE TRIGGER update_csv_rows_updated_at
BEFORE UPDATE ON public.csv_rows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();