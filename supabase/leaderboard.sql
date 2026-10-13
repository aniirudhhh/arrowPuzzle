-- Run after schema.sql. All leaderboard writes and attempt validation are server-only.
CREATE TABLE IF NOT EXISTS public.arrow_players (
 id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, nickname text NOT NULL CHECK(length(nickname) BETWEEN 2 AND 24), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.arrow_attempts (
 id uuid PRIMARY KEY, player_id uuid NOT NULL REFERENCES public.arrow_players(id), state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS arrow_attempt_player_created ON public.arrow_attempts(player_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.arrow_scores (
 player_id uuid NOT NULL REFERENCES public.arrow_players(id), challenge integer NOT NULL, version integer NOT NULL, category text NOT NULL CHECK(category IN ('unassisted','with-hints')), duration_ms integer NOT NULL CHECK(duration_ms>0), hearts integer NOT NULL CHECK(hearts BETWEEN 1 AND 3), hints integer NOT NULL CHECK(hints>=0), attempt_id uuid NOT NULL REFERENCES public.arrow_attempts(id), achieved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(player_id,challenge,version,category)
);
CREATE INDEX IF NOT EXISTS arrow_scores_ranking ON public.arrow_scores(challenge,version,category,duration_ms,hearts DESC);
ALTER TABLE public.arrow_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrow_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrow_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arrow_players,public.arrow_attempts,public.arrow_scores FROM anon,authenticated;
-- Keep attempts referenced by scores. Remove only old, unreferenced attempts during maintenance.
