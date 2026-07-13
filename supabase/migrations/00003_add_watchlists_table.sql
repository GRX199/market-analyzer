-- Create watchlists table
CREATE TABLE public.watchlists (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    market_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    timeframe TEXT DEFAULT '1H',
    last_signal TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can CRUD own watchlists" 
ON public.watchlists FOR ALL 
USING (auth.uid() = user_id);
