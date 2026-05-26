import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS entirely. Only call from server-side
// code (Server Components, Route Handlers, Server Actions). Never import
// this in client components or expose it to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
