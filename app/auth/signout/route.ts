import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { IMPERSONATION_COOKIE, readImpersonation } from '@/lib/impersonation'

// POST-only to prevent sign-out via prefetched GET links (CSRF hygiene).
export async function POST(request: Request) {
  const supabase = await createClient()
  const store = await cookies()
  // 2026-10-05 (SCAN-746): read the act-as stash BEFORE signing out. While a janitor is acting as a
  // member the session cookie is the member's, and the default (global) signOut would revoke every
  // session that member holds on every device. Sign the borrowed session out on this device only,
  // then restore the janitor's own stashed session and sign that out locally too, so the stashed
  // refresh token is revoked rather than left valid. A plain sign-out keeps its global scope.
  const acting = await readImpersonation()
  if (acting) {
    await supabase.auth.signOut({ scope: 'local' })
    const { error } = await supabase.auth.setSession({ access_token: acting.at, refresh_token: acting.rt })
    if (!error) await supabase.auth.signOut({ scope: 'local' })
  } else {
    await supabase.auth.signOut({ scope: 'global' })
  }
  // Clear any act-as stash so a signout-while-impersonating can't leave a stale
  // cookie that confuses the next sign-in.
  store.delete(IMPERSONATION_COOKIE)

  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/`, { status: 303 })
}
