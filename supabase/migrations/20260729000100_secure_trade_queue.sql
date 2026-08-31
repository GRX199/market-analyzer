-- Secure and make the MT5 trade queue idempotent.
--
-- Timestamped after the historical 001 baseline so existing remote databases
-- receive this migration through a normal Supabase migration push.
--
-- This migration deliberately quarantines legacy pending rows that do not have
-- an idempotency key. Re-submit those trades through the authenticated API
-- instead of letting a newly deployed worker execute an ambiguous old command.

BEGIN;

-- Fail with an explicit recovery message instead of partially mutating a
-- database that was created only from the incompatible legacy 001 baseline.
DO $migration$
BEGIN
  IF to_regclass('public.users') IS NULL
    OR to_regclass('public.alerts') IS NULL
    OR to_regclass('public.journals') IS NULL
    OR to_regclass('public.portfolios') IS NULL
    OR to_regclass('public.watchlists') IS NULL
    OR to_regclass('public.auto_trades') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'alerts'
        AND column_name = 'id'
        AND data_type = 'text'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'watchlists'
        AND column_name = 'id'
        AND data_type = 'text'
    )
  THEN
    RAISE EXCEPTION
      'canonical schema 00001-00004 is missing or incompatible; back up the database and reconcile the legacy 001-only schema before applying the secure trade queue'
      USING ERRCODE = '55000';
  END IF;
END
$migration$;

-- Repair missing profile rows if the auth trigger was installed after users
-- had already signed up.
INSERT INTO public.users (id)
SELECT id
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- A persistent optimistic-concurrency version prevents a failed notification
-- sender from rolling a watchlist state back across an A -> B -> A transition.
ALTER TABLE public.watchlists
  ADD COLUMN IF NOT EXISTS scanner_claim_version UUID DEFAULT gen_random_uuid();

UPDATE public.watchlists
SET scanner_claim_version = gen_random_uuid()
WHERE scanner_claim_version IS NULL;

ALTER TABLE public.watchlists
  ALTER COLUMN scanner_claim_version SET DEFAULT gen_random_uuid(),
  ALTER COLUMN scanner_claim_version SET NOT NULL;

ALTER TABLE public.auto_trades
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broker_order_ticket TEXT;

ALTER TABLE public.auto_trades
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN volume SET DEFAULT 0.01,
  ALTER COLUMN attempts SET DEFAULT 0;

UPDATE public.auto_trades
SET attempts = 0
WHERE attempts IS NULL;

ALTER TABLE public.auto_trades
  ALTER COLUMN attempts SET NOT NULL;

-- Never execute anonymous, malformed, or non-idempotent legacy commands.
UPDATE public.auto_trades
SET
  status = 'failed',
  error_message = COALESCE(
    NULLIF(error_message, ''),
    'Quarantined by secure queue migration; submit the trade again.'
  )
WHERE status = 'pending'
  AND (
    user_id IS NULL
    OR idempotency_key IS NULL
    OR char_length(idempotency_key) NOT BETWEEN 8 AND 128
    OR idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$'
    OR action NOT IN ('buy', 'sell')
    OR market_type <> 'crypto'
    OR volume IS NULL
    OR volume <= 0
    OR volume > 100
    OR symbol !~ '^[A-Z0-9][A-Z0-9./_#-]{1,31}$'
  );

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_user_id_required'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_user_id_required
      CHECK (user_id IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_symbol_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_symbol_valid
      CHECK (
        char_length(symbol) BETWEEN 2 AND 32
        AND symbol ~ '^[A-Z0-9][A-Z0-9./_#-]{1,31}$'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_market_type_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_market_type_valid
      CHECK (market_type = 'crypto') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_action_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_action_valid
      CHECK (action IN ('buy', 'sell')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_volume_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_volume_valid
      CHECK (volume > 0 AND volume <= 100) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_status_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_status_valid
      CHECK (status IN ('pending', 'processing', 'executed', 'failed')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_idempotency_key_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_idempotency_key_valid
      CHECK (
        idempotency_key IS NOT NULL
        AND char_length(idempotency_key) BETWEEN 8 AND 128
        AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_attempts_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_attempts_valid
      CHECK (attempts BETWEEN 0 AND 5) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_processing_claim_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_processing_claim_valid
      CHECK (
        status <> 'processing'
        OR (
          worker_id IS NOT NULL
          AND char_length(worker_id) BETWEEN 3 AND 64
          AND worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$'
          AND claimed_at IS NOT NULL
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_execution_result_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_execution_result_valid
      CHECK (
        status <> 'executed'
        OR (
          executed_at IS NOT NULL
          AND execution_price IS NOT NULL
          AND execution_price > 0
          AND broker_order_ticket IS NOT NULL
          AND char_length(broker_order_ticket) BETWEEN 1 AND 64
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.auto_trades'::regclass
      AND conname = 'auto_trades_failure_result_valid'
  ) THEN
    ALTER TABLE public.auto_trades
      ADD CONSTRAINT auto_trades_failure_result_valid
      CHECK (
        status <> 'failed'
        OR (
          error_message IS NOT NULL
          AND char_length(error_message) BETWEEN 1 AND 2000
        )
      ) NOT VALID;
  END IF;
END
$migration$;

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
      'duplicate auto_trades (user_id, idempotency_key) values must be reconciled before creating the secure queue index'
      USING ERRCODE = '23505';
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS auto_trades_user_id_idempotency_key_uidx
  ON public.auto_trades (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS auto_trades_pending_claim_idx
  ON public.auto_trades (created_at, id)
  WHERE status = 'pending' AND attempts < 5;

CREATE INDEX IF NOT EXISTS auto_trades_worker_processing_idx
  ON public.auto_trades (worker_id, claimed_at)
  WHERE status = 'processing';

ALTER TABLE public.auto_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own auto_trades" ON public.auto_trades;
DROP POLICY IF EXISTS "Users can view own auto_trades" ON public.auto_trades;

CREATE POLICY "Users can view own auto_trades"
ON public.auto_trades
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Browser clients can only read their own queue records. Creation is routed
-- through /api/trades, while server-side worker endpoints use the service role
-- only after validating their dedicated bearer token.
REVOKE ALL ON TABLE public.auto_trades FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.auto_trades FROM authenticated;
GRANT SELECT ON TABLE public.auto_trades TO authenticated;
GRANT ALL ON TABLE public.auto_trades TO service_role;

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
    -- A processing row is never reclaimed blindly: the broker may have
    -- accepted its order before the worker lost connectivity. Reconcile stale
    -- claims against the broker using idempotency_key before manual resolution.
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
      claimed_at = timezone('utc', now()),
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

-- Safe, nullable portfolio lifecycle fields used by the existing UI model.
ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS closed_price NUMERIC,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.portfolios'::regclass
      AND conname = 'portfolios_type_valid'
  ) THEN
    ALTER TABLE public.portfolios
      ADD CONSTRAINT portfolios_type_valid
      CHECK (type IS NULL OR type IN ('buy', 'sell')) NOT VALID;
  END IF;
END
$migration$;

COMMIT;
