import { asCaller, authorizeCaller, toMeView } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { runPostSignInClaims } from '@/lib/auth/post-sign-in'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'

// POST /api/v1/session/bootstrap (LIVE-718): the native twin of the web's auth callback. A native
// app exchanges its PKCE code with supabase-js itself and never reaches app/auth/callback, so this
// runs the SAME post-sign-in step (lib/auth/post-sign-in.ts): guest seats, signup leads, guest
// tickets and guest orders attach to the account just proven.
//
// Call it right after sign-in and on every cold start: each claim attaches only rows still
// unclaimed, so a repeat is a no-op. The claims need the caller's own session (they resolve the
// person from auth.uid()), which asCaller provides: inside it createClient() is the bearer client.
//
// `account.created` is emitted with the same stable idempotency key the callback uses, so an
// account first seen on the app still enters the signup funnel exactly once.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limited = await rateLimited(request, 'session-bootstrap', { limit: 30, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const claimed = await asCaller(auth, async () => runPostSignInClaims(await createClient(), auth.caller.id))
    await track('account.created', { source: 'app' }, auth.caller.id, {
      idempotencyKey: `account.created:${auth.caller.id}`,
    }).catch(() => {})
    return ok({ me: toMeView(auth), ...claimed })
  } catch (e) {
    return failFrom(e)
  }
}
