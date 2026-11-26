import { envFlag } from '@/lib/env/string'
import { safeNextPath } from '@/lib/auth/safe-next'

// The pure half of the staff two-step rule (SEC-046): no Next, no Supabase, so proxy.ts can read it
// without pulling a server client into the edge bundle. The enforcing half is lib/auth/mfa.ts.

/** BREAK GLASS. Off unless an owner sets `ADMIN_MFA_BYPASS` in Vercel (docs/RUNBOOKS.md, "Two-step
 *  codes for staff"): for the one case where every admin has lost their authenticator. */
export function adminMfaBypassed(): boolean {
  return envFlag('ADMIN_MFA_BYPASS')
}

/** Where a staff session without aal2 is sent: the code step when a verified factor exists, else setup. */
export function stepUpPath(hasVerifiedFactor: boolean, next: string): string {
  const step = hasVerifiedFactor ? 'mfa' : 'mfa-setup'
  const safe = safeNextPath(next) || '/admin'
  return `/sign-in?step=${step}&next=${encodeURIComponent(safe)}`
}

/** proxy.ts: a server-action POST under /admin from a session that has not passed a two-step code is
 *  refused before it runs. It covers the admin actions gated by a bespoke check rather than one of the
 *  staff guards. A legitimate staff session reached the page through the guarded layout, so it is
 *  already aal2 and never meets this. */
export function refuseAdminActionWithoutAal2(input: {
  method: string
  pathname: string
  isServerAction: boolean
  aal: unknown
}): boolean {
  if (adminMfaBypassed()) return false
  if (input.method !== 'POST' || !input.isServerAction) return false
  if (input.pathname !== '/admin' && !input.pathname.startsWith('/admin/')) return false
  return input.aal !== 'aal2'
}
