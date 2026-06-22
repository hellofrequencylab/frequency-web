// Runtime menu role + mode resolution for the DB-backed menus (lib/menus).
//
// The reader (lib/menus/read.ts) returns EVERYTHING (every item, every mode); the
// RENDERER decides what a given viewer actually sees. This module owns that decision:
//   1. `viewerRoleFor(...)` collapses a viewer's axes (anon / community trust ladder /
//      staff web_role) into the SINGLE MenuAccess token the menu data is keyed by.
//   2. `effectiveMode(el, viewerRole)` resolves one item / rail card to its effective
//      mode for that viewer: a per-role override wins over the base mode, then the
//      `minAccess` floor downgrades anyone below it (to ghost, or hidden when the
//      element was never an upsell). The three modes mean:
//        - active = a normal link
//        - ghost  = shown muted; click opens the upgrade lightbox, never navigates
//        - hidden = not rendered at all
//
// Framework independent (no React / Supabase) so the server layouts and the client
// MegaBar can both import it. Tokens are decided in the renderer; no copy here. No
// em or en dashes.

import type { CommunityRole, WebRole } from '@/lib/core/roles'
import { isStaff, isJanitor } from '@/lib/core/roles'
import type { MenuAccess, MenuMode, ResolvedItem, ResolvedRailCard } from '@/lib/menus/types'

// The MenuAccess ladder, lowest to highest. A viewer "meets" an access level when
// their own rank is at least that level's rank. Mirrors lib/menus/types MenuAccess
// and the DB CHECK ordering.
const ACCESS_LADDER: readonly MenuAccess[] = [
  'visitor',
  'member',
  'crew',
  'host',
  'guide',
  'mentor',
  'admin',
  'janitor',
]

function accessRank(access: MenuAccess): number {
  const i = ACCESS_LADDER.indexOf(access)
  return i < 0 ? 0 : i
}

/** True when `viewerRole` is at least `min` on the MenuAccess ladder. */
export function meetsMenuAccess(viewerRole: MenuAccess, min: MenuAccess): boolean {
  return accessRank(viewerRole) >= accessRank(min)
}

// The community trust roles that are valid MenuAccess tokens directly (the ladder
// shares the host/guide/mentor rungs). 'crew' on the community axis is a retired
// no-op rung (lib/core/roles), but it stays a valid MenuAccess token for the paid
// "Crew" tier, so we never map a community role TO 'crew' here.
const COMMUNITY_AS_ACCESS: Record<CommunityRole, MenuAccess> = {
  member: 'member',
  crew: 'member',
  host: 'host',
  guide: 'guide',
  mentor: 'mentor',
  admin: 'mentor',
  janitor: 'mentor',
}

/** Collapse a viewer's axes into the single MenuAccess token the menu data is keyed
 *  by. Staff is authoritative on top of the community ladder (ADR-208): a janitor
 *  web_role maps to 'janitor', any other staff to 'admin'; otherwise the community
 *  trust role maps onto its ladder rung. A logged-out viewer (or an explicit visitor
 *  preview) is 'visitor'. */
export function viewerRoleFor(opts: {
  loggedIn: boolean
  communityRole?: CommunityRole | null
  webRole?: WebRole | null
  /** True when a janitor is previewing the logged-out experience (view-as visitor). */
  previewVisitor?: boolean
}): MenuAccess {
  if (!opts.loggedIn || opts.previewVisitor) return 'visitor'
  if (isJanitor(opts.webRole)) return 'janitor'
  if (isStaff(opts.webRole)) return 'admin'
  if (opts.communityRole) return COMMUNITY_AS_ACCESS[opts.communityRole]
  return 'member'
}

type ModedElement = Pick<ResolvedItem, 'mode' | 'roleModes' | 'minAccess'> | ResolvedRailCard

// Rail cards carry no minAccess (only items gate by access); treat a missing
// minAccess as 'visitor' (everyone) so a card only hides/ghosts via its own mode.
function minAccessOf(el: ModedElement): MenuAccess {
  return 'minAccess' in el ? el.minAccess : 'visitor'
}

/** Resolve an item / rail card to its effective mode for this viewer.
 *
 *  Order of resolution:
 *    1. Start from the per-role override (`roleModes[viewerRole]`) if present, else
 *       the element's base `mode`.
 *    2. Apply the `minAccess` floor: a viewer below it can never get 'active'. If the
 *       element was authored as an upsell ('ghost' base/override), keep it ghosted so
 *       they see what they are missing; otherwise it is 'hidden'. A viewer who meets
 *       `minAccess` keeps the mode from step 1 unchanged. */
export function effectiveMode(el: ModedElement, viewerRole: MenuAccess): MenuMode {
  const base: MenuMode = el.roleModes[viewerRole] ?? el.mode
  if (base === 'hidden') return 'hidden'

  if (meetsMenuAccess(viewerRole, minAccessOf(el))) return base

  // Below the access floor: a deliberate upsell stays a ghost; anything else hides.
  return base === 'ghost' ? 'ghost' : 'hidden'
}
