import { AsyncLocalStorage } from 'node:async_hooks'
import type { User } from '@supabase/supabase-js'

// THE BEARER REQUEST SCOPE (LIVE-717). The web's identity reads all funnel through two seams:
// `createClient()` in lib/supabase/server.ts (the cookie session client) and `getCachedUser()` in
// lib/auth.ts (one `auth.getUser()` per request). A native /api/v1 caller has no cookie, so without
// this every lib function a route reuses (the capability loaders, the feed reader, the RSVP step)
// would see a signed-out visitor.
//
// `runAsBearer` binds a VERIFIED bearer identity to the async call tree of one route's work. Inside
// it, `createClient()` returns the bearer client (anon key plus the caller's own token, so every
// read is still that person under RLS) and `getCachedUser()` returns the user Supabase Auth already
// verified. Nothing else changes: the same lib code runs, the same gates apply.
//
// WHO MAY OPEN IT. Only lib/contract/caller.ts, after `auth.getUser(token)` has accepted the token
// (`asCaller`). The store is an AsyncLocalStorage per call, so it is invisible to every other
// request, including a concurrent one on the same instance. The view-as preview (a web cookie)
// never applies inside it (lib/view-as.ts), which is rule 4 of the app contract.
//
// Dependency-free on purpose (node:async_hooks and a type), so the two seams can import it without
// a cycle.

export interface BearerIdentity {
  /** The caller's Supabase access token, already verified by Supabase Auth. */
  token: string
  /** The user that verification returned. */
  user: User
}

const storage = new AsyncLocalStorage<BearerIdentity>()

/** Run `fn` as the verified bearer caller. Call only after the token was verified. */
export function runAsBearer<T>(identity: BearerIdentity, fn: () => Promise<T>): Promise<T> {
  return storage.run(identity, fn)
}

/** The bearer identity this call tree runs as, or null on the web's cookie path. */
export function bearerIdentity(): BearerIdentity | null {
  return storage.getStore() ?? null
}
