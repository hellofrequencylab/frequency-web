import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { supabaseUrl, supabaseAnonKey } from './env'

// Safe to call multiple times — createBrowserClient is cheap and
// returns the same singleton per origin in the browser.
export function createClient() {
  return createBrowserClient<Database>(
    supabaseUrl(),
    supabaseAnonKey()
  )
}
