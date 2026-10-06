import 'server-only'
import { createClient, type User } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { supabaseUrl, supabaseAnonKey } from './env'

// The BEARER client (LIVE-715, ADR-1643): the fifth construction beside client / server / public /
// admin, for a caller who presents a Supabase access token in `Authorization: Bearer <token>`
// instead of the web's session cookie. A native app holds its session in the device keychain and
// sends the token on every request; it has no cookie to send.
//
// It is the ANON key plus the caller's own token, so every query runs as that person under RLS,
// exactly as the cookie session client does. It is never the service role. It persists nothing,
// refreshes nothing and reads no URL: the token is the whole session, and refreshing it is the
// app's job (it holds the refresh token, the server never sees it).
//
// It does not verify the token. lib/contract/caller.ts does, with `auth.getUser(token)`, which asks
// Supabase Auth (GET /auth/v1/user), so a forged, expired or revoked token is refused there before
// this client reads a row.
export function createBearerClient(accessToken: string, verifiedUser?: User) {
  const client = createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  // Inside a verified request scope (LIVE-716): lib code written for the cookie client asks
  // `supabase.auth.getUser()` with no argument, which on a client that persists nothing finds no
  // session and answers "signed out". The token was already verified by Supabase Auth
  // (lib/contract/caller.ts), so the no-argument call answers with that user. A call that passes a
  // token still asks Auth.
  if (verifiedUser) {
    const askAuth = client.auth.getUser.bind(client.auth)
    client.auth.getUser = ((jwt?: string) =>
      jwt ? askAuth(jwt) : Promise.resolve({ data: { user: verifiedUser }, error: null })) as typeof client.auth.getUser
  }
  return client
}
