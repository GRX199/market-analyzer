-- Enforce the sequential worker contract at the database boundary.
--
-- A limit of one per HTTP request is not sufficient: concurrent workers can
-- otherwise each claim a different row for the same broker owner. One
-- unresolved processing row now blocks every later claim for that owner until
-- the broker result is reconciled and the row becomes terminal.

BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.auto_trades') IS NULL THEN
    RAISE EXCEPTION
      'auto_trades is missing; apply the canonical queue migrations first'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.auto_trades
    WHERE status = 'processing'
      AND user_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'processing auto_trades without an owner must be reconciled before enabling the sequential queue'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.auto_trades
    WHERE status = 'processing'
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'multiple processing auto_trades for one owner must be reconciled before enabling the sequential queue'
      USING ERRCODE = '23505';
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS auto_trades_one_processing_per_user_uidx
  ON public.auto_trades (user_id)
  WHERE status = 'processing';

DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, UUID, INTEGER);

CREATE FUNCTION public.claim_auto_trades(
  worker_id TEXT,
  owner_user_id UUID,
  "limit" INTEGER DEFAULT 1
)
RETURNS SETOF public.auto_trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  normalized_worker_id TEXT := btrim($1);
  normalized_owner_user_id UUID := $2;
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

  IF COALESCE($3, 1) <> 1 THEN
    RAISE EXCEPTION 'sequential claim limit must be exactly 1'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize claim decisions for one exact owner across every worker and
  -- host. The unique partial index remains a second line of defense for state
  -- changes made outside this RPC.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_owner_user_id::TEXT, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.auto_trades AS active
    WHERE active.user_id = normalized_owner_user_id
      AND active.status = 'processing'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidate AS MATERIALIZED (
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
    LIMIT 1
  ),
  claimed AS (
    UPDATE public.auto_trades AS queued
    SET
      status = 'processing',
      worker_id = normalized_worker_id,
      claimed_at = now(),
      attempts = queued.attempts + 1,
      error_message = NULL
    FROM candidate
    WHERE queued.id = candidate.id
      AND queued.status = 'pending'
      AND queued.user_id = normalized_owner_user_id
    RETURNING queued.*
  )
  SELECT claimed.*
  FROM claimed;
END
$function$;

REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER) TO service_role;

COMMIT;
