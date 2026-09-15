-- ONLY for a disposable PostgreSQL instance. Never run this on Supabase.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE auth.users(id UUID PRIMARY KEY);
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
CREATE TABLE public.auto_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id),
  symbol TEXT, market_type TEXT, action TEXT, volume NUMERIC, status TEXT DEFAULT 'pending',
  worker_id TEXT, claimed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
  idempotency_key TEXT, attempts INTEGER DEFAULT 0, error_message TEXT,
  UNIQUE(user_id, idempotency_key)
);
\ir ../../supabase/migrations/20260915000100_add_direct_order_intents.sql
\ir ../../supabase/migrations/20260915000200_add_forex_news_schedules.sql
\ir ../../supabase/migrations/20260915000200_add_forex_news_schedules.sql

CREATE FUNCTION public.news_test_schedule(target UUID, until_seconds int DEFAULT 90, kind text DEFAULT 'demo') RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.forex_news_orders(id,user_id,event_id,event,symbol,instrument,account_kind,account_ref,order_type,volume,entry_price,stop_loss,take_profit,condition,scheduled_at,expires_at,offset_seconds,request_fingerprint)
  VALUES(target,'00000000-0000-4000-8000-000000000001','fixture:cpi','{}','XAU/USD','XAUUSDc',kind,repeat('a',24),'buy_stop',0.01,101,99,105,'at_time',clock_timestamp()-interval '10 seconds',clock_timestamp()+until_seconds*interval '1 second',0,'fixture');
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated, anon, service_role;
