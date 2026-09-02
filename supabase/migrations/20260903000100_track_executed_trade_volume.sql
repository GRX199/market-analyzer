-- Record the broker-filled volume separately from the user's exact request.

BEGIN;

DO $migration$
BEGIN
  IF to_regclass('public.auto_trades') IS NULL THEN
    RAISE EXCEPTION
      'auto_trades is missing; apply the canonical queue migrations first'
      USING ERRCODE = '55000';
  END IF;
END
$migration$;

ALTER TABLE public.auto_trades
  ADD COLUMN IF NOT EXISTS executed_volume NUMERIC;

ALTER TABLE public.auto_trades
  DROP CONSTRAINT IF EXISTS auto_trades_executed_volume_valid;

ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_executed_volume_valid
  CHECK (
    executed_volume IS NULL
    OR (executed_volume > 0 AND executed_volume <= 100)
  ) NOT VALID;

ALTER TABLE public.auto_trades
  VALIDATE CONSTRAINT auto_trades_executed_volume_valid;

COMMENT ON COLUMN public.auto_trades.executed_volume IS
  'Actual MT5 broker-filled volume; volume remains the user-requested exact lot.';

COMMIT;
