// THE Space Loom management door (LIVE-566, ADR-1578; child 1 of PROG-D5 under ADR-1559).
//
// A Space declares a `loom` FUNCTION in lib/spaces/functions.ts (label Loom Studio, default min-role
// editor). An operator can switch that function off in spaces.entitlements, or raise its bar to admin in
// spaces.feature_roles, and the /manage console hides the tile accordingly. Until this seam existed, the
// Studio page and its Studio-only delete opened on `caps.canEditProfile` alone, so the switch and the bar
// were read by nothing on the Space side: a Space that set Loom Studio to admin still had every editor
// deleting images at /spaces/<slug>/loom.
//
// TWO DOORS, ON PURPOSE (ADR-1559 §4). This is the MANAGEMENT door: the Studio page and every
// Studio-only write decide on it. The picker's space scope for READING and UPLOADING stays on
// `canEditProfile`: switching the Studio off must not stop an editor putting an image on the page they
// are editing. The Studio is the function; the picker is the editing door.
//
// PURE, like lib/spaces/functions.ts: no IO, no Supabase, no Next. Compose it with the IO that resolves
// the viewer's space role (getSpaceCapabilities -> caps.role). It is its own file rather than an inline
// call because LIVE-570's policies and LIVE-571's session reads read the same answer from here.

import { spaceFunctionAccess } from '@/lib/spaces/functions'
import type { SpaceLike } from '@/lib/spaces/entitlements'
import type { SpaceRole } from '@/lib/spaces/membership'

/** The function key the Space Loom Studio is gated by (one row in SPACE_FUNCTIONS). */
export const SPACE_LOOM_FUNCTION = 'loom' as const

/**
 * May a viewer holding `viewerSpaceRole` on `space` MANAGE that Space's Loom (open the Studio, remove its
 * images)? TRUE iff the `loom` function is enabled on the Space AND the role meets its effective min-role
 * (the per-Space override in feature_roles, else the code default `editor`). FAIL-SAFE: a null or unknown
 * role reads as NO; a malformed blob reads as the code defaults (the resolver's own fail-safe, so a garbage
 * blob never locks a manager out). The ONE thing added over the resolver: a missing Space reads as NO. The
 * resolver treats a null Space like an empty blob (every function on at its default bar), which is right
 * for a menu and wrong for a door: with no Space there is nothing to manage. PURE.
 */
export function canManageSpaceLoom(
  space: ({ featureRoles?: unknown } & SpaceLike) | null | undefined,
  viewerSpaceRole: SpaceRole | null | undefined,
): boolean {
  if (!space) return false
  return spaceFunctionAccess(space, SPACE_LOOM_FUNCTION, viewerSpaceRole)
}
