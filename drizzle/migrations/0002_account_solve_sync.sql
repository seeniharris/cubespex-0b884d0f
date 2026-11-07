CREATE TABLE public.cube_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  event text NOT NULL,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  deleted_at_ms bigint,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.cube_solves (
  user_id uuid NOT NULL,
  id text NOT NULL,
  session_id text NOT NULL,
  event text NOT NULL,
  time_ms bigint NOT NULL CHECK (time_ms >= 0),
  penalty text NOT NULL CHECK (penalty IN ('none', '+2', 'DNF')),
  scramble text NOT NULL DEFAULT '',
  recorded_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  deleted_at_ms bigint,
  PRIMARY KEY (user_id, id),
  CONSTRAINT cube_solves_session_owner_fk
    FOREIGN KEY (user_id, session_id)
    REFERENCES public.cube_sessions (user_id, id)
    ON DELETE CASCADE
);

CREATE INDEX cube_sessions_user_event_created_idx
  ON public.cube_sessions (user_id, event, created_at_ms);
CREATE INDEX cube_solves_user_session_recorded_idx
  ON public.cube_solves (user_id, session_id, recorded_at_ms, id);

ALTER TABLE public.cube_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cube_solves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cube sessions"
  ON public.cube_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own cube solves"
  ON public.cube_solves FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cube_solves TO authenticated;
GRANT ALL ON public.cube_sessions TO service_role;
GRANT ALL ON public.cube_solves TO service_role;

CREATE FUNCTION public.keep_cube_session_newer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.updated_at_ms < OLD.updated_at_ms THEN
    RAISE EXCEPTION 'Stale CubeSpex session update rejected' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.keep_cube_solve_newer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.updated_at_ms < OLD.updated_at_ms THEN
    RAISE EXCEPTION 'Stale CubeSpex solve update rejected' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cube_sessions_prevent_timestamp_regression
  BEFORE UPDATE ON public.cube_sessions
  FOR EACH ROW EXECUTE FUNCTION public.keep_cube_session_newer();
CREATE TRIGGER cube_solves_prevent_timestamp_regression
  BEFORE UPDATE ON public.cube_solves
  FOR EACH ROW EXECUTE FUNCTION public.keep_cube_solve_newer();

CREATE FUNCTION public.soft_delete_cube_sessions(_ids text[], _updated_at_ms bigint[])
RETURNS TABLE(id text) LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH requested AS (
    SELECT * FROM unnest(_ids, _updated_at_ms) AS item(id, updated_at_ms)
  ), updated AS (
    UPDATE public.cube_sessions AS target
    SET deleted_at_ms = item.updated_at_ms, updated_at_ms = item.updated_at_ms
    FROM requested AS item
    WHERE target.user_id = auth.uid()
      AND target.id = item.id
      AND target.deleted_at_ms IS NULL
      AND target.updated_at_ms <= item.updated_at_ms
    RETURNING target.id
  )
  SELECT updated.id FROM updated
  UNION
  SELECT target.id
  FROM public.cube_sessions AS target
  JOIN requested AS item ON item.id = target.id
  WHERE target.user_id = auth.uid() AND target.deleted_at_ms IS NOT NULL;
$$;

CREATE FUNCTION public.soft_delete_cube_solves(_ids text[], _updated_at_ms bigint[])
RETURNS TABLE(id text) LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH requested AS (
    SELECT * FROM unnest(_ids, _updated_at_ms) AS item(id, updated_at_ms)
  ), updated AS (
    UPDATE public.cube_solves AS target
    SET deleted_at_ms = item.updated_at_ms, updated_at_ms = item.updated_at_ms
    FROM requested AS item
    WHERE target.user_id = auth.uid()
      AND target.id = item.id
      AND target.deleted_at_ms IS NULL
      AND target.updated_at_ms <= item.updated_at_ms
    RETURNING target.id
  )
  SELECT updated.id FROM updated
  UNION
  SELECT target.id
  FROM public.cube_solves AS target
  JOIN requested AS item ON item.id = target.id
  WHERE target.user_id = auth.uid() AND target.deleted_at_ms IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_cube_sessions(text[], bigint[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_cube_solves(text[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_cube_sessions(text[], bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_cube_solves(text[], bigint[]) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'cube_sessions'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cube_sessions';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'cube_solves'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cube_solves';
    END IF;
  END IF;
END $$;
