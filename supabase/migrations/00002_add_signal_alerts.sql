-- Add timeframe and target_signal to alerts table
ALTER TABLE public.alerts 
ADD COLUMN IF NOT EXISTS target_signal TEXT,
ADD COLUMN IF NOT EXISTS timeframe TEXT;
