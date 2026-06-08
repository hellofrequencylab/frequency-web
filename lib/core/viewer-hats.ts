// Server seam: the live caller → the access matrix's `Hats` (access-matrix.ts).
//
// THE ONE PLACE that reads the caller's role / entitlement / personas / staff and
// projects them onto the access matrix, so every surface gates the same way and never
// drifts. Server-only (uses getCallerProfile + the staff lookup) — the client mirrors
// the same matrix from props. Mirrors load-capabilities.ts (the per-scope resolver's
// server seam) for the surface-level matrix.
//
// This is the unified-site spine: a page asks `surfaceAccess('vault')` and reveals the
// matching controls. When the entitlement tier (P2) and personas (P3) tables land, ONLY
// this function changes — every wired surface flips automatically.

import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import {
  accessTo,
  type AccessLevel,
  type Hats,
  type Surface,
} from './access-matrix'

/** Resolve the live caller's hats. Logged-out ⇒ a visitor. */
export async function getViewerHats(): Promise<Hats> {
  const profile = await getCallerProfile()
  if (!profile) return { loggedIn: false }

  const staff = await getStaffMember().catch(() => null)
  return {
    loggedIn: true,
    role: profile.community_role,
    // TODO(P2): read the real entitlement tier (free/member/supporter). Until the tier
    // flag lands, the paid gate falls back to the crew-or-above proxy in columnsForHats.
    tier: null,
    // TODO(P3): read the caller's active profile_personas.
    personas: null,
    staff: staff?.role ?? null,
  }
}

/** The caller's access level on a surface — the matrix, resolved for the live viewer. */
export async function surfaceAccess(surface: Surface): Promise<AccessLevel> {
  return accessTo(surface, await getViewerHats())
}

/** Convenience: does the live caller get FULL function on this surface? */
export async function canUseSurface(surface: Surface): Promise<boolean> {
  return (await surfaceAccess(surface)) === 'full'
}
