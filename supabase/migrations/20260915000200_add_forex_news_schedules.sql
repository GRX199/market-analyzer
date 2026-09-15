BEGIN;

ALTER TABLE public.auto_trades
  ADD COLUMN IF NOT EXISTS news_valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broker_account_ref TEXT;

CREATE TABLE IF NOT EXISTS public.forex_news_orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event JSONB NOT NULL,
  symbol TEXT NOT NULL,
  instrument TEXT NOT NULL,
  account_kind TEXT NOT NULL CHECK (account_kind IN ('demo', 'real')),
  account_ref TEXT NOT NULL CHECK (account_ref ~ '^[a-f0-9]{24}$'),
  order_type TEXT NOT NULL CHECK (order_type IN ('buy_limit','buy_stop','sell_limit','sell_stop')),
  volume NUMERIC NOT NULL CHECK (volume > 0 AND volume <= 100),
  entry_price NUMERIC NOT NULL CHECK (entry_price > 0),
  stop_loss NUMERIC NOT NULL CHECK (stop_loss > 0),
  take_profit NUMERIC NOT NULL CHECK (take_profit > 0),
  condition TEXT NOT NULL CHECK (condition IN ('at_time','actual_above','actual_below')),
  offset_seconds INTEGER NOT NULL CHECK (offset_seconds BETWEEN 0 AND 600),
  scheduled_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'armed' CHECK (status IN ('armed','queued','blocked','expired','cancelled')),
  reason TEXT,
  trade_id UUID REFERENCES public.auto_trades(id),
  request_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > scheduled_at AND expires_at <= scheduled_at + INTERVAL '5 minutes'),
  CHECK ((order_type LIKE 'buy_%' AND stop_loss < entry_price AND entry_price < take_profit)
    OR (order_type LIKE 'sell_%' AND stop_loss > entry_price AND entry_price > take_profit))
);
ALTER TABLE public.forex_news_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forex_news_orders FROM anon, authenticated;
GRANT SELECT ON public.forex_news_orders TO authenticated;
GRANT ALL ON public.forex_news_orders TO service_role;
DROP POLICY IF EXISTS forex_news_orders_owner_read ON public.forex_news_orders;
CREATE POLICY forex_news_orders_owner_read ON public.forex_news_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS forex_news_orders_due_idx ON public.forex_news_orders(user_id, account_kind, scheduled_at) WHERE status = 'armed';

-- Cancellation and dispatch lock the same row. A committed dispatch cannot be
-- cancelled as if it had never been sent. Retrying dispatch returns the same row.
CREATE OR REPLACE FUNCTION public.transition_forex_news_order(
  p_id UUID, p_owner UUID, p_state TEXT, p_reason TEXT DEFAULT NULL,
  p_quote NUMERIC DEFAULT NULL, p_account_ref TEXT DEFAULT NULL
) RETURNS SETOF public.forex_news_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
  target public.forex_news_orders;
  ticket UUID;
  utc_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM public.forex_news_orders WHERE id = p_id AND user_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  utc_now := clock_timestamp();
  IF target.status <> 'armed' THEN RETURN NEXT target; RETURN; END IF;
  IF p_state NOT IN ('queued','cancelled','expired','blocked') THEN RAISE EXCEPTION 'invalid transition'; END IF;
  IF p_state = 'queued' THEN
    IF utc_now < target.scheduled_at THEN RAISE EXCEPTION 'schedule is not due'; END IF;
    IF utc_now >= target.expires_at THEN
      UPDATE public.forex_news_orders SET status='expired', reason='Jendela news berakhir.' WHERE id=p_id RETURNING * INTO target;
      RETURN NEXT target; RETURN;
    END IF;
    IF p_account_ref IS DISTINCT FROM target.account_ref OR p_quote IS NULL OR p_quote <= 0 THEN
      RAISE EXCEPTION 'broker account/quote mismatch';
    END IF;
    INSERT INTO public.auto_trades(user_id, symbol, market_type, action, volume, order_type,
      quote_price, entry_price, stop_loss, take_profit, account_kind, status,
      idempotency_key, attempts, news_valid_until, broker_account_ref, created_at)
    VALUES (p_owner, target.instrument, 'forex', CASE WHEN target.order_type LIKE 'buy_%' THEN 'buy' ELSE 'sell' END,
      target.volume, target.order_type, p_quote, target.entry_price, target.stop_loss, target.take_profit,
      target.account_kind, 'pending', 'news:' || target.id::TEXT, 0, target.expires_at, target.account_ref, utc_now)
    RETURNING id INTO ticket;
  END IF;
  UPDATE public.forex_news_orders SET status=p_state, reason=left(p_reason,500), trade_id=ticket WHERE id=p_id RETURNING * INTO target;
  RETURN NEXT target;
END $fn$;
REVOKE ALL ON FUNCTION public.transition_forex_news_order(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_forex_news_order(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT) TO service_role;
DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT, TEXT);
CREATE FUNCTION public.claim_auto_trades(
  worker_id TEXT,
  owner_user_id UUID,
  "limit" INTEGER DEFAULT 1,
  account_kind TEXT DEFAULT 'demo',
  news_account_ref TEXT DEFAULT NULL
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
      AND (queued.news_valid_until IS NULL OR queued.broker_account_ref = $5)
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
      claimed_at = clock_timestamp(), attempts = queued.attempts + 1,
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

REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_trades(TEXT, UUID, INTEGER, TEXT, TEXT) TO service_role;
COMMIT;
