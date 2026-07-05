-- Market Analyzer Database Schema
-- Supabase PostgreSQL Migration

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_market TEXT DEFAULT 'crypto' CHECK (preferred_market IN ('forex', 'stocks', 'crypto')),
  theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  disclaimer_accepted BOOLEAN DEFAULT FALSE,
  disclaimer_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlist
CREATE TABLE IF NOT EXISTS public.watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market_type TEXT NOT NULL CHECK (market_type IN ('forex', 'stocks', 'crypto')),
  display_name TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol, market_type)
);

-- Price and score alerts
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market_type TEXT NOT NULL CHECK (market_type IN ('forex', 'stocks', 'crypto')),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'price_above', 'price_below',
    'score_above', 'score_below',
    'signal_change', 'trend_change'
  )),
  target_value DECIMAL,
  target_signal TEXT CHECK (target_signal IN ('strong_buy', 'buy', 'hold', 'sell', 'strong_sell')),
  is_active BOOLEAN DEFAULT TRUE,
  is_triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  repeat_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Signal history
CREATE TABLE IF NOT EXISTS public.signal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  market_type TEXT NOT NULL CHECK (market_type IN ('forex', 'stocks', 'crypto')),
  signal_type TEXT NOT NULL CHECK (signal_type IN ('strong_buy', 'buy', 'hold', 'sell', 'strong_sell')),
  technical_score DECIMAL NOT NULL,
  fundamental_score DECIMAL NOT NULL,
  sentiment_score DECIMAL NOT NULL,
  final_score DECIMAL NOT NULL,
  confidence DECIMAL,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  trend TEXT CHECK (trend IN ('bullish', 'bearish', 'sideways')),
  price_at_signal DECIMAL NOT NULL,
  current_price DECIMAL,
  price_change_pct DECIMAL,
  reasons JSONB,
  support_level DECIMAL,
  resistance_level DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  evaluation_status TEXT DEFAULT 'pending' CHECK (evaluation_status IN ('profit', 'loss', 'pending')),
  timeframe TEXT DEFAULT '1D',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ
);

-- User notes on assets
CREATE TABLE IF NOT EXISTS public.user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market_type TEXT NOT NULL CHECK (market_type IN ('forex', 'stocks', 'crypto')),
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  email_alerts BOOLEAN DEFAULT TRUE,
  push_alerts BOOLEAN DEFAULT TRUE,
  signal_notifications BOOLEAN DEFAULT TRUE,
  price_notifications BOOLEAN DEFAULT TRUE,
  news_notifications BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users manage own watchlist" ON public.watchlists FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own alerts" ON public.alerts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own notes" ON public.user_notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage notification prefs" ON public.notification_preferences FOR ALL USING (auth.uid() = user_id);

-- Signal history readable by all authenticated users
CREATE POLICY "Authenticated users view signals" ON public.signal_history FOR SELECT TO authenticated USING (true);

-- Indexes
CREATE INDEX idx_watchlists_user_id ON public.watchlists(user_id);
CREATE INDEX idx_alerts_user_id ON public.alerts(user_id);
CREATE INDEX idx_alerts_symbol ON public.alerts(symbol);
CREATE INDEX idx_signal_history_symbol ON public.signal_history(symbol);
CREATE INDEX idx_signal_history_created ON public.signal_history(created_at DESC);
CREATE INDEX idx_user_notes_user_symbol ON public.user_notes(user_id, symbol);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_watchlists_updated_at BEFORE UPDATE ON public.watchlists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_user_notes_updated_at BEFORE UPDATE ON public.user_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
