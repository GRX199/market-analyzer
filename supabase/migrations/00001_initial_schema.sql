-- Create users table (maps to Supabase Auth users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    telegram_chat_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create alerts table
CREATE TABLE public.alerts (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    market_type TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    target_value NUMERIC,
    is_active BOOLEAN DEFAULT true,
    is_triggered BOOLEAN DEFAULT false,
    triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create journals table
CREATE TABLE public.journals (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    symbol TEXT,
    emotion TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create portfolios table
CREATE TABLE public.portfolios (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    market_type TEXT NOT NULL,
    entry_price NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    is_open BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
-- Users can only access their own profile
CREATE POLICY "Users can view own profile" 
ON public.users FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
ON public.users FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Alerts Policies
CREATE POLICY "Users can CRUD own alerts" 
ON public.alerts FOR ALL 
USING (auth.uid() = user_id);

-- Journals Policies
CREATE POLICY "Users can CRUD own journals" 
ON public.journals FOR ALL 
USING (auth.uid() = user_id);

-- Portfolios Policies
CREATE POLICY "Users can CRUD own portfolios" 
ON public.portfolios FOR ALL 
USING (auth.uid() = user_id);

-- Function to automatically create a user profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
