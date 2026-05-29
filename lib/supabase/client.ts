import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

// Safe to call multiple times — createBrowserClient is cheap and
// returns the same singleton per origin in the browser.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
