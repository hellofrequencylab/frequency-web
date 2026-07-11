// INVITE GATE — the admission check behind platform_flags.beta_invite_only (ADR: beta access).
//
// When invite-only is ON, only an ADMITTED beta contact or an already-existing member/staff may CREATE
// an account. This module answers "is this email admitted?" and "should we block a NEW signup for this
// email?" for the two enforcement points in the passwordless signup path:
//   - app/sign-in/actions.ts (signInWithMagicLink): passes shouldCreateUser=false for a blocked email,
//     so the OTP never provisions a new auth user (existing members still get their login link).
//   - app/auth/callback/route.ts (OAuth + magic-link callback): rolls back a brand-new, non-admitted
//     account the moment it would land.
//
// SAFETY — every read here FAILS OPEN: a DB hiccup resolves to "admitted / do not block", so a transient
// error can never wall off signup or lock anyone out. Existing members are handled STRUCTURALLY by the
// callers (shouldCreateUser=false lets them through; the callback only rolls back accounts created in
// the current exchange), so this module only needs to recognize an invited beta contact.
//
// `contacts` is untyped in the generated types → the service-role admin client is used untyped.

import { createAdminClient } from '@/lib/supabase/admin'
import { betaInviteOnly } from '@/lib/platform-flags'

/** Is this email an ADMITTED beta contact — a contacts row with source='beta_waitlist' and
 *  meta.beta_status='invited'? Case-insensitive match. FAILS OPEN (returns true) on any error so a
 *  DB hiccup never wrongly blocks someone. */
export async function isInvitedBetaContact(email: string): Promise<boolean> {
  const clean = email.trim().toLowerCase()
  if (!clean) return false
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('contacts')
      .select('id, meta')
      .eq('source', 'beta_waitlist')
      .ilike('email', clean)
      .limit(1)
      .maybeSingle()
    if (!data) return false
    const meta = (data.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>
    return meta.beta_status === 'invited'
  } catch {
    // Fail open: never block on an admission-lookup error.
    return true
  }
}

/** Should a brand-NEW account for this email be blocked right now? True ONLY when invite-only is ON and
 *  the email is not an invited beta contact. Both reads fail open (invite-only defaults FALSE on error;
 *  the contact lookup returns true/admitted on error), so this resolves to FALSE — "don't block" — on
 *  any failure. Callers still let existing members through structurally; this governs new accounts. */
export async function shouldBlockNewSignup(email: string): Promise<boolean> {
  if (!(await betaInviteOnly())) return false
  return !(await isInvitedBetaContact(email))
}
