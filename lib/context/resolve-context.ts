// ╔══════════════════════════════════════════════════════════════════════════════════════╗
// ║  OPERATOR-IDENTITY CONTEXT — the SERVER resolver. FRAMING ONLY. NEVER AUTHORIZATION.    ║
// ╠══════════════════════════════════════════════════════════════════════════════════════╣
// ║  The server-only half of the operator-identity context (see lib/context/operator-       ║
// ║  context.ts for the pure core + the full invariant). This file is split out so the pure  ║
// ║  parse/validate/serialize helpers stay CLIENT-SAFE: `import 'server-only'` here taints    ║
// ║  this module out of the client bundle, while the chip + switcher import only the pure     ║
// ║  core. Keeping `cookies()` + the DB read in one server-only module is what lets the        ║
// ║  presentational components compile into the client bundle (Next refuses a client import    ║
// ║  of a server-only module — which is exactly the boundary this split respects).             ║
// ║                                                                                            ║
// ║  THE INVARIANT (unchanged): the resolved context is FRAMING ONLY. The cookie is NEVER      ║
// ║  trusted — the available set is RE-DERIVED from real authority (owned/admin Spaces + the   ║
// ║  staff axis) on every read, and the cookie's value is honoured ONLY when it is still in    ║
// ║  that set. An out-of-set value, or any error, fails SAFE to `personal`. No gate ever reads ║
// ║  this. If you import this into a gate, STOP — you have a bug.                               ║
// ╚══════════════════════════════════════════════════════════════════════════════════════╝

import 'server-only'
import { cookies } from 'next/headers'
import { listOperatedSpaces, type OperatedSpace } from '@/lib/spaces/operated'
import { isStaff } from '@/lib/core/roles'
import {
  CONTEXT_COOKIE,
  PERSONAL_CONTEXT,
  PERSONAL_HOME,
  ADMIN_HOME,
  parseContextCookie,
  isContextAvailable,
  type AvailableContext,
  type ContextCaller,
  type ResolvedContext,
} from '@/lib/context/operator-context'

/** The personal option (always present — every signed-in member has the member identity). */
function personalOption(): AvailableContext {
  return { kind: 'personal', label: 'Personal', href: PERSONAL_HOME }
}

/** An operator option for one Space the caller runs. */
function operatorOption(space: OperatedSpace): AvailableContext {
  return {
    kind: 'operator',
    spaceId: space.id,
    label: space.name,
    href: space.manageHref,
    logoUrl: space.logoUrl,
  }
}

/** The admin option (only when the caller is real platform staff). */
function adminOption(): AvailableContext {
  return { kind: 'admin', label: 'Admin', href: ADMIN_HOME }
}

/**
 * Resolve the caller's EFFECTIVE operator context + the AVAILABLE set, re-derived from real authority.
 *
 * FRAMING ONLY (see the file header + the pure core): this drives the chip, the badge, and the
 * default-landing redirect — never a gate. The cookie is NEVER trusted: the available set is rebuilt
 * from the DB (the Spaces the caller owns/admins + the staff axis), and the cookie's value is honoured
 * ONLY when it is still in that set. An `operator:<id>` the caller no longer admins, or `admin` for a
 * non-staff caller, fails SAFE to `personal`. Batched (one `listOperatedSpaces` read) and fail-safe:
 * any error collapses to just the personal context.
 */
export async function resolveOperatorContext(
  caller: ContextCaller | null | undefined,
): Promise<ResolvedContext> {
  // Signed-out / no profile: only the personal context, no cookie honoured.
  if (!caller) return { context: PERSONAL_CONTEXT, available: [personalOption()] }

  try {
    // Re-derive the real authority (never the cookie): the Spaces the caller owns/admins + staff axis.
    const operated = await listOperatedSpaces(caller.id)
    const staff = isStaff(caller.webRole)

    const available: AvailableContext[] = [
      personalOption(),
      ...operated.map(operatorOption),
      ...(staff ? [adminOption()] : []),
    ]

    // Read the requested context from the cookie, then HONOUR it only if it is still in the real set.
    const requested = parseContextCookie((await cookies()).get(CONTEXT_COOKIE)?.value)
    const context = requested && isContextAvailable(requested, available) ? requested : PERSONAL_CONTEXT
    return { context, available }
  } catch {
    // Any failure collapses to the safe default — the context can never error a render or over-grant.
    return { context: PERSONAL_CONTEXT, available: [personalOption()] }
  }
}
