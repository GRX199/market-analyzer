import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Return a mock client for development without Supabase
    console.warn('Supabase credentials not configured. Running in mock mode.');
    return null;
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
