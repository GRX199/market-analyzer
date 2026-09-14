-- Direct Signals order intents for the serialized MT5 worker.
--
-- Legacy market crypto rows remain valid. New Signals rows carry the complete
-- pending-order geometry and an explicit account scope so demo and real
-- workers cannot claim each other's orders.

BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.auto_trades') IS NULL THEN
    RAISE EXCEPTION 'auto_trades is missing; apply the canonical queue migrations first'
      USING ERRCODE = '55000';
  END IF;
END
$migration$;

ALTER TABLE public.auto_trades
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'market',
  ADD COLUMN IF NOT EXISTS quote_price NUMERIC,
  ADD COLUMN IF NOT EXISTS entry_price NUMERIC,
  ADD COLUMN IF NOT EXISTS stop_loss NUMERIC,
  ADD COLUMN IF NOT EXISTS take_profit NUMERIC,
  ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'demo';

UPDATE public.auto_trades
SET order_type = 'market' WHERE order_type IS NULL;
UPDATE public.auto_trades
SET account_kind = 'demo' WHERE account_kind IS NULL;

ALTER TABLE public.auto_trades
  ALTER COLUMN order_type SET DEFAULT 'market',
  ALTER COLUMN order_type SET NOT NULL,
  ALTER COLUMN account_kind SET DEFAULT 'demo',
  ALTER COLUMN account_kind SET NOT NULL;

ALTER TABLE public.auto_trades DROP CONSTRAINT IF EXISTS auto_trades_market_type_valid;
ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_market_type_valid
  CHECK (market_type IN ('crypto', 'forex')) NOT VALID;

ALTER TABLE public.auto_trades DROP CONSTRAINT IF EXISTS auto_trades_symbol_valid;
ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_symbol_valid
  CHECK (char_length(symbol) BETWEEN 2 AND 32 AND symbol ~* '^[A-Z0-9][A-Z0-9./_#-]{1,31}$') NOT VALID;

ALTER TABLE public.auto_trades DROP CONSTRAINT IF EXISTS auto_trades_order_type_valid;
ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_order_type_valid
  CHECK (order_type IN ('market', 'buy_limit', 'buy_stop', 'sell_limit', 'sell_stop')) NOT VALID;

ALTER TABLE public.auto_trades DROP CONSTRAINT IF EXISTS auto_trades_account_kind_valid;
ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_account_kind_valid
  CHECK (account_kind IN ('demo', 'real')) NOT VALID;

ALTER TABLE public.auto_trades DROP CONSTRAINT IF EXISTS auto_trades_direct_geometry_valid;
ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_direct_geometry_valid
  CHECK (
    (order_type = 'market' AND market_type = 'crypto'
      AND quote_price IS NULL AND entry_price IS NULL AND stop_loss IS NULL AND take_profit IS NULL)
    OR
    (order_type <> 'market'
      AND quote_price IS NOT NULL AND quote_price > 0
      AND entry_price IS NOT NULL AND entry_price > 0
      AND stop_loss IS NOT NULL AND stop_loss > 0
      AND take_profit IS NOT NULL AND take_profit > 0
      AND ((order_type IN ('buy_limit', 'buy_stop') AND stop_loss < entry_price AND entry_price < take_profit)
        OR (order_type IN ('sell_limit', 'sell_stop') AND stop_loss > entry_price AND entry_price > take_profit))
      AND ((order_type = 'buy_limit' AND entry_price < quote_price)
        OR (order_type = 'buy_stop' AND entry_price > quote_price)
        OR (order_type = 'sell_limit' AND entry_price > quote_price)
        OR (order_type = 'sell_stop' AND entry_price < quote_price)))
  ) NOT VALID;

-- Demo and real workers for one owner may each have one unresolved mutation.
DROP INDEX IF EXISTS public.auto_trades_one_processing_per_user_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS auto_trades_one_processing_per_user_account_uidx
  ON public.auto_trades (user_id, account_kind)
  WHERE status = 'processing';

DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT);

CREATE FUNCTION public.claim_auto_trades(
  worker_id TEXT,
  owner_user_id UUID,
  "limit" INTEGER DEFAULT 1,
  account_kind TEXT DEFAULT 'demo'
)
RETURNS SETOF public.auto_trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  normalized_worker_id TEXT := btrim($1);
  normalized_owner_user_id UUID := $2;
  normalized_account_kind TEXT := lower(btrim(COALESCE($4, 'demo')));
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'claim_auto_trades requires the service role' USING ERRCODE = '42501';
  END IF;
  IF normalized_worker_id IS NULL
    OR char_length(normalized_worker_id) NOT BETWEEN 3 AND 64
    OR normalized_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$'
  THEN
    RAISE EXCEPTION 'invalid worker_id' USING ERRCODE = '22023';
  END IF;
  IF normalized_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF normalized_account_kind NOT IN ('demo', 'real') THEN
    RAISE EXCEPTION 'account_kind must be demo or real' USING ERRCODE = '22023';
  END IF;
  IF COALESCE($3, 1) <> 1 THEN
    RAISE EXCEPTION 'sequential claim limit must be exactly 1' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_owner_user_id::TEXT || ':' || normalized_account_kind, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.auto_trades AS active
    WHERE active.user_id = normalized_owner_user_id
      AND active.account_kind = normalized_account_kind
      AND active.status = 'processing'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidate AS MATERIALIZED (
    SELECT queued.id
    FROM public.auto_trades AS queued
    WHERE queued.status = 'pending'
      AND queued.market_type IN ('crypto', 'forex')
      AND queued.account_kind = normalized_account_kind
      AND queued.attempts < 5
      AND queued.user_id = normalized_owner_user_id
      AND char_length(queued.idempotency_key) BETWEEN 8 AND 128
      AND queued.idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$'
      AND char_length(queued.symbol) BETWEEN 2 AND 32
      AND queued.symbol ~* '^[A-Z0-9][A-Z0-9./_#-]{1,31}$'
      AND queued.action IN ('buy', 'sell')
      AND queued.volume > 0 AND queued.volume <= 100
    ORDER BY queued.created_at, queued.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.auto_trades AS queued
    SET status = 'processing', worker_id = normalized_worker_id,
      claimed_at = timezone('utc', now()), attempts = queued.attempts + 1,
      error_message = NULL
    FROM candidate
    WHERE queued.id = candidate.id
      AND queued.status = 'pending'
      AND queued.user_id = normalized_owner_user_id
      AND queued.account_kind = normalized_account_kind
    RETURNING queued.*
  )
  SELECT claimed.* FROM claimed ORDER BY claimed.created_at, claimed.id;
END
$function$;

REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT) TO service_role;

COMMENT ON COLUMN public.auto_trades.account_kind IS 'Worker account scope: demo or real; never inferred from source metadata.';
COMMENT ON COLUMN public.auto_trades.order_type IS 'market for the legacy crypto queue, otherwise one of the four MT5 pending types.';

COMMIT;
