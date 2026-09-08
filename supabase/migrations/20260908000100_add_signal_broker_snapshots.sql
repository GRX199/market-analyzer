-- Private market candles only. No account balances or order execution.
BEGIN;
CREATE TABLE IF NOT EXISTS public.signal_broker_snapshots (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol text NOT NULL CHECK (length(symbol) <= 24),
  captured_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 524288),
  PRIMARY KEY (user_id, symbol)
);
ALTER TABLE public.signal_broker_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signal_broker_snapshots FROM anon, authenticated;
GRANT SELECT ON public.signal_broker_snapshots TO authenticated;
GRANT ALL ON public.signal_broker_snapshots TO service_role;
DROP POLICY IF EXISTS signal_snapshot_owner_read ON public.signal_broker_snapshots;
CREATE POLICY signal_snapshot_owner_read ON public.signal_broker_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Atomic monotonic publication: a delayed upload cannot replace newer data.
CREATE OR REPLACE FUNCTION public.publish_signal_snapshot(p_user_id uuid, p_symbol text, p_captured_at timestamptz, p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  IF p_captured_at < now() - interval '3 minutes' OR p_captured_at > now() + interval '30 seconds' THEN
    RAISE EXCEPTION 'snapshot timestamp outside upload window';
  END IF;
  INSERT INTO public.signal_broker_snapshots(user_id, symbol, captured_at, payload)
  VALUES (p_user_id, p_symbol, p_captured_at, p_payload)
  ON CONFLICT (user_id, symbol) DO UPDATE SET captured_at = excluded.captured_at, payload = excluded.payload
  WHERE excluded.captured_at > signal_broker_snapshots.captured_at;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_signal_snapshot(uuid, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_signal_snapshot(uuid, text, timestamptz, jsonb) TO service_role;
COMMIT;
