-- Membuat tabel Auto Trades untuk Robot MT5
CREATE TABLE public.auto_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    market_type TEXT NOT NULL,
    action TEXT NOT NULL, -- 'buy' atau 'sell'
    volume NUMERIC DEFAULT 0.01,
    status TEXT DEFAULT 'pending', -- 'pending', 'executed', 'failed'
    execution_price NUMERIC,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE
);

-- Mengaktifkan Pengamanan RLS
ALTER TABLE public.auto_trades ENABLE ROW LEVEL SECURITY;

-- Membuat Aturan Hak Akses
CREATE POLICY "Users can CRUD own auto_trades" 
ON public.auto_trades FOR ALL 
USING (auth.uid() = user_id);
