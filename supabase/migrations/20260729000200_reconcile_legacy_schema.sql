-- Reconcile side effects left by the former 001_initial_schema.sql baseline.
--
-- That legacy migration created update triggers on the canonical alerts and
-- watchlists tables even though those tables do not have an updated_at column.
-- Keep user data and the separate legacy tables intact, but remove triggers and
-- duplicate policies that can break normal application writes.

BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.alerts') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'alerts'
        AND column_name = 'updated_at'
    )
  THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_alerts_updated_at ON public.alerts';
    EXECUTE 'DROP POLICY IF EXISTS "Users manage own alerts" ON public.alerts';
  END IF;

  IF to_regclass('public.watchlists') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'watchlists'
        AND column_name = 'updated_at'
    )
  THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_watchlists_updated_at ON public.watchlists';
    EXECUTE 'DROP POLICY IF EXISTS "Users manage own watchlist" ON public.watchlists';
  END IF;

  -- The former baseline created signal_history and a SELECT policy but omitted
  -- ENABLE ROW LEVEL SECURITY. Preserve its data while closing anonymous and
  -- authenticated write access.
  IF to_regclass('public.signal_history') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.signal_history ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users view signals" ON public.signal_history';
    EXECUTE 'CREATE POLICY "Authenticated users view signals" ON public.signal_history FOR SELECT TO authenticated USING (true)';
    EXECUTE 'REVOKE ALL ON TABLE public.signal_history FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.signal_history FROM anon';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.signal_history FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.signal_history TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.signal_history TO service_role';
  END IF;
END
$migration$;

COMMIT;
