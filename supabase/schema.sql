-- Run once in the Supabase SQL Editor before deploying.
-- Credentials and full room state are accessible only to the server connection.
CREATE TABLE IF NOT EXISTS public.arrow_rooms (
  code text PRIMARY KEY CHECK (code ~ '^[A-F0-9]{6}$'),
  state jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS arrow_rooms_expiry_idx ON public.arrow_rooms (expires_at);
ALTER TABLE public.arrow_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.arrow_rooms FROM anon, authenticated;
-- No browser-facing policies: players interact through /api/race only.
-- Optional scheduled maintenance: DELETE FROM public.arrow_rooms WHERE expires_at < now();
