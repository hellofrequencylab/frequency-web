import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminMfaBypassed, stepUpPath } from '@/lib/auth/mfa-policy'

// TWO-STEP CODES FOR STAFF (SEC-046, owner ruling 2026-11-26: "Required for admins").
//
// A password, a magic link or a Google sign-in is ONE factor. Anyone who reaches /admin, or who passes a
// staff gate in an action, must ALSO have proved a code from an authenticator app in this session
// (Supabase's `aal2`). Members are never asked, and setup is offered to staff only, because these gates
// are the only place a code is enforced.
//
// WHERE IT IS ENFORCED, and why in two places:
//   · the staff guards (requireAdmin, requireAdminFloor, requireStaff, requireStaffCap, requireJanitor)
//     call `requireStaffAal2` AFTER the role check passes, so a member is never asked for a code they
//     have no reason to own, and every page and action behind those guards is covered;
//   · proxy.ts refuses a server-action POST under /admin from a session that is not aal2, which covers
//     the admin actions that gate themselves with a bespoke check instead of one of the guards above.
//
// The level is read from the access token's VERIFIED claims (getClaims checks the signature locally),
// never from an unverified session cookie. The factor list is only read on the redirect path.
//
// BREAK GLASS: `ADMIN_MFA_BYPASS` (envFlag) turns the requirement off for every staff account, for the
// one case where every admin has lost their device. docs/RUNBOOKS.md, "Two-step codes for staff".

interface ClaimsLike {
  aal?: unknown
}

/**
 * Require a two-step-verified session of a caller ALREADY KNOWN TO BE STAFF. `redirect` sends them to
 * the code step (or setup); `throw` is for JSON routes, where a redirect would hand the client a page.
 */
export async function requireStaffAal2(
  opts: { next?: string; mode?: 'redirect' | 'throw' } = {},
): Promise<void> {
  if (adminMfaBypassed()) return
  const supabase = await createClient()
  const claims = ((await supabase.auth.getClaims()).data?.claims ?? null) as ClaimsLike | null
  if (claims?.aal === 'aal2') return
  if (opts.mode === 'throw') throw new Error('Forbidden: two-step code required')
  const { data } = await supabase.auth.mfa.listFactors()
  const verified = (data?.totp ?? []).length > 0
  redirect(stepUpPath(verified, opts.next ?? '/admin'))
}
