'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCallerProfile, getRealCallerWebRole } from '@/lib/auth'
import {
  CONTEXT_COOKIE,
  parseContextCookie,
  serializeContext,
  resolveOperatorContext,
  isContextAvailable,
  landingHrefFor,
  PERSONAL_HOME,
  type OperatorContext,
} from '@/lib/context/operator-context'

// "Switch which hat I'm wearing" — the set-context server action, mirroring the set-cookie-then-
// reload shape of setViewAsRole (app/(main)/view-as-actions.ts).
//
// FRAMING ONLY (see lib/context/operator-context.ts): the context this writes is PRESENTATIONAL —
// it cannot grant or change any power. The action's ONLY job is to record which identity the chip
// frames and to route to that identity's default landing. Every real gate (resolveSpaceManageAccess
// for a Space's /manage, requireAdmin / isStaff for /admin) re-checks the caller's REAL authority
// independently, so a forged or stale cookie buys nothing.
//
// It still VALIDATES the requested target against the caller's REAL available contexts (re-derived
// from the DB on every call) and refuses anything not in that set — so the cookie can only ever hold
// a context the caller genuinely has, and an operator target for a Space they don't run (or `admin`
// for a non-staff caller) is rejected, falling back to clearing the cookie (personal).

const CONTEXT_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // Auto-expires (8h) like the view-as preview, so a stale framing never lingers indefinitely.
  maxAge: 60 * 60 * 8,
}

/** What the client does next after the context is set: navigate to the new identity's default
 *  landing. `href` is always a safe in-app path (the personal home on any miss). */
export interface SetContextResult {
  href: string
}

/**
 * Switch the caller's operator-identity context. Accepts the cookie wire-form (`personal` /
 * `operator:<spaceId>` / `admin`) so the client can pass exactly what it rendered.
 *
 * VALIDATES the target against the caller's REAL available contexts (re-derived from the DB via
 * `resolveOperatorContext`): an unknown / unavailable target — incl. an operator Space the caller no
 * longer runs, or `admin` for a non-staff caller — is REJECTED and clears the cookie back to personal.
 * A valid target is written to the HttpOnly cookie. Never throws to the client (fail-safe to the
 * personal home). Returns the default-landing href for the client to navigate to.
 */
export async function setOperatorContext(target: string | null): Promise<SetContextResult> {
  const caller = await getCallerProfile()
  // Signed-out / no profile: nothing to frame; send home, no cookie.
  if (!caller) return { href: PERSONAL_HOME }

  // Re-derive the REAL available set (never trust the incoming string). webRole here is the TRUE
  // staff axis (ignores any view-as preview) so the admin option is offered iff the caller is staff.
  const realWebRole = await getRealCallerWebRole()
  const { available } = await resolveOperatorContext({ id: caller.id, webRole: realWebRole })

  const jar = await cookies()
  const requested: OperatorContext | null = parseContextCookie(target)

  // Reject an unknown / unavailable target: clear the cookie (back to personal) and route home. A
  // `personal` target also just clears the cookie — personal is the cookie-absent default.
  if (!requested || requested.kind === 'personal' || !isContextAvailable(requested, available)) {
    jar.delete(CONTEXT_COOKIE)
    revalidatePath('/', 'layout')
    return { href: PERSONAL_HOME }
  }

  // A validated non-personal context: record it + route to its default landing.
  jar.set(CONTEXT_COOKIE, serializeContext(requested), CONTEXT_COOKIE_OPTS)
  revalidatePath('/', 'layout')
  return { href: landingHrefFor(requested, available) }
}
