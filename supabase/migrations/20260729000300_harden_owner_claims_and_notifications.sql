-- Upgrade databases that installed an earlier secure-queue draft.
--
-- This migration removes the owner-agnostic claim overload, restores all
-- queue validation defenses, adds an ABA-safe watchlist scanner version, and
-- closes the RLS omission left by the historical duplicate baseline.

BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.auto_trades') IS NULL
    OR to_regclass('public.watchlists') IS NULL
  THEN
    RAISE EXCEPTION
      'secure queue/watchlist tables are missing; apply the canonical migrations first'
      USING ERRCODE = '55000';
  END IF;
END
$migration$;

ALTER TABLE public.watchlists
  ADD COLUMN IF NOT EXISTS scanner_claim_version UUID DEFAULT gen_random_uuid();

UPDATE public.watchlists
SET scanner_claim_version = gen_random_uuid()
WHERE scanner_claim_version IS NULL;

ALTER TABLE public.watchlists
  ALTER COLUMN scanner_claim_version SET DEFAULT gen_random_uuid(),
  ALTER COLUMN scanner_claim_version SET NOT NULL;

-- A NOT VALID constraint still checks updated rows. Temporarily remove this
-- one so malformed pending rows from an older draft can be quarantined.
ALTER TABLE public.auto_trades
  DROP CONSTRAINT IF EXISTS auto_trades_idempotency_key_valid;

UPDATE public.auto_trades
SET
  status = 'failed',
  error_message = COALESCE(
    NULLIF(error_message, ''),
    'Quarantined by owner-bound queue migration; submit the trade again.'
  )
WHERE status = 'pending'
  AND (
    idempotency_key IS NULL
    OR char_length(idempotency_key) NOT BETWEEN 8 AND 128
    OR idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$'
  );

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.auto_trades
    WHERE user_id IS NOT NULL
      AND idempotency_key IS NOT NULL
    GROUP BY user_id, idempotency_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'duplicate auto_trades (user_id, idempotency_key) values must be reconciled before the secure queue upgrade'
      USING ERRCODE = '23505';
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS auto_trades_user_id_idempotency_key_uidx
  ON public.auto_trades (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_idempotency_key_valid
  CHECK (
    idempotency_key IS NOT NULL
    AND char_length(idempotency_key) BETWEEN 8 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$'
  ) NOT VALID;

DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, UUID, INTEGER);

CREATE FUNCTION public.claim_auto_trades(
  worker_id TEXT,
  owner_user_id UUID,
  "limit" INTEGER DEFAULT 10
)
RETURNS SETOF public.auto_trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  normalized_worker_id TEXT := btrim($1);
  normalized_owner_user_id UUID := $2;
  claim_limit INTEGER := LEAST(GREATEST(COALESCE($3, 10), 1), 50);
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'claim_auto_trades requires the service role'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_worker_id IS NULL
    OR char_length(normalized_worker_id) NOT BETWEEN 3 AND 64
    OR normalized_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$'
  THEN
    RAISE EXCEPTION 'invalid worker_id'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id is required'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT queued.id
    FROM public.auto_trades AS queued
    WHERE queued.status = 'pending'
      AND queued.market_type = 'crypto'
      AND queued.attempts < 5
      AND queued.user_id = normalized_owner_user_id
      AND char_length(queued.idempotency_key) BETWEEN 8 AND 128
      AND queued.idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$'
      AND char_length(queued.symbol) BETWEEN 2 AND 32
      AND queued.symbol ~ '^[A-Z0-9][A-Z0-9./_#-]{1,31}$'
      AND queued.action IN ('buy', 'sell')
      AND queued.volume > 0
      AND queued.volume <= 100
    ORDER BY queued.created_at, queued.id
    FOR UPDATE SKIP LOCKED
    LIMIT claim_limit
  ),
  claimed AS (
    UPDATE public.auto_trades AS queued
    SET
      status = 'processing',
      worker_id = normalized_worker_id,
      claimed_at = now(),
      attempts = queued.attempts + 1,
      error_message = NULL
    FROM candidates
    WHERE queued.id = candidates.id
      AND queued.status = 'pending'
      AND queued.user_id = normalized_owner_user_id
    RETURNING queued.*
  )
  SELECT claimed.*
  FROM claimed
  ORDER BY claimed.created_at, claimed.id;
END
$function$;

REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) TO service_role;

DO $migration$
BEGIN
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
