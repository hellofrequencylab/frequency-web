import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

// Service-role client — bypasses RLS entirely. Only call from server-side
// code (Server Components, Route Handlers, Server Actions). Never import
// this in client components or expose it to the browser.
//
// Uses createServerClient (same as lib/supabase/server.ts) for compatibility
// with the sb_secret_... key format. Cookie handlers are intentionally empty
// because this client authenticates via the service role key, not a user
// session cookie.
export function createAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}
