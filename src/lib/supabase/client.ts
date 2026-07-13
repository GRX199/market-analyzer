import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Global instance for simple usage outside React components if needed
// Note: For auth state inside React, prefer calling createClient() in the component/hook
export const supabase = createClient();
