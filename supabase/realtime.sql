-- Run AFTER schema.sql. Safe room snapshots are broadcast only to authorized players.
CREATE TABLE IF NOT EXISTS public.arrow_live_members (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, topic)
);
ALTER TABLE public.arrow_live_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arrow_live_members FROM anon, authenticated;
GRANT SELECT ON public.arrow_live_members TO authenticated;
DROP POLICY IF EXISTS "Read own race memberships" ON public.arrow_live_members;
CREATE POLICY "Read own race memberships" ON public.arrow_live_members
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Receive own race updates" ON realtime.messages;
CREATE POLICY "Receive own race updates" ON realtime.messages
  FOR SELECT TO authenticated USING (
    extension = 'broadcast' AND EXISTS (
      SELECT 1 FROM public.arrow_live_members m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.topic = (SELECT realtime.topic()) AND m.expires_at > now()
    )
  );

CREATE OR REPLACE FUNCTION public.arrow_broadcast_room()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  recipient jsonb;
  roster jsonb;
  snapshot jsonb;
  total integer;
  winner_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.state->>'revision' IS NOT DISTINCT FROM OLD.state->>'revision' THEN
    RETURN NEW;
  END IF;
  total := jsonb_array_length(NEW.state->'board'->'paths');
  SELECT p->>'name' INTO winner_name FROM jsonb_array_elements(NEW.state->'players') p
    WHERE p->>'token' = NEW.state->>'winner';
  FOR recipient IN SELECT value FROM jsonb_array_elements(NEW.state->'players') LOOP
    SELECT jsonb_agg(jsonb_build_object(
      'name', p->>'name', 'you', p->>'token' = recipient->>'token',
      'host', p->'host', 'ready', p->'ready', 'hearts', p->'hearts',
      'escaped', total - jsonb_array_length(p->'paths'), 'finished', p->'finished',
      'rematch', p->'rematch', 'connected',
      ((NEW.state->>'updated')::bigint - coalesce((p->>'lastSeen')::bigint, (NEW.state->>'updated')::bigint)) <= 15000
    )) INTO roster FROM jsonb_array_elements(NEW.state->'players') p;
    snapshot := jsonb_build_object(
      'code', NEW.code, 'phase', NEW.state->'phase', 'startAt', NEW.state->'startAt',
      'serverNow', NEW.state->'updated', 'round', NEW.state->'round',
      'revision', NEW.state->'revision', 'difficulty', NEW.state->'difficulty',
      'rematchDeclinedBy', NEW.state->'rematchDeclinedBy',
      'size', NEW.state->'board'->'size', 'total', total,
      'winner', winner_name, 'youWon', coalesce(NEW.state->>'winner' = recipient->>'token', false),
      'players', roster, 'paths', recipient->'paths'
    );
    PERFORM realtime.send(snapshot, 'room', 'race:' || NEW.code || ':' || md5(recipient->>'token'), true);
  END LOOP;
  UPDATE public.arrow_live_members SET expires_at = NEW.expires_at
    WHERE topic LIKE 'race:' || NEW.code || ':%';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.arrow_broadcast_room() FROM PUBLIC;
DROP TRIGGER IF EXISTS arrow_room_realtime ON public.arrow_rooms;
CREATE TRIGGER arrow_room_realtime AFTER INSERT OR UPDATE ON public.arrow_rooms
  FOR EACH ROW EXECUTE FUNCTION public.arrow_broadcast_room();
