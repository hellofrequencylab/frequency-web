import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'
import { supabaseUrl, supabaseAnonKey } from './env'
import { createBearerClient } from './bearer'
import { bearerIdentity } from './request-identity'

type ServerClient = ReturnType<typeof createServerClient<Database>>

// Must be called with `await` — cookies() is async in Next.js 16.
//
// Inside a verified /api/v1 bearer scope (lib/supabase/request-identity.ts, LIVE-717) this is the
// bearer client instead: the same anon key, the caller's own token in place of the cookie, so the
// read runs as the same person under the same RLS. The two clients expose the same query API.
export async function createClient(): Promise<ServerClient> {
  const bearer = bearerIdentity()
  if (bearer) return createBearerClient(bearer.token) as unknown as ServerClient
  const cookieStore = await cookies()

  return createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component where cookies are read-only.
            // The proxy already handles refreshing the session cookie, so
            // this error is safe to suppress.
          }
        },
      },
    }
  )
}
