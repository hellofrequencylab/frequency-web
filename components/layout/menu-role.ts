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
import { staffCan, type StaffRole, type StaffDomain, type Access } from '@/lib/core/staff-roles'
import type {
  MenuAccess,
  MenuMode,
  ResolvedCategory,
  ResolvedItem,
  ResolvedRailCard,
} from '@/lib/menus/types'

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

// ── Two-axis visibility (ADR-390) ─────────────────────────────────────────────
// The single gate every container renderer (rail, header, footer, user, contextual
// admin sub-header) uses to decide whether a viewer may SEE a menu element. It
// UNIONS the two axes exactly like the admin nav did (lib/admin/sections.ts
// canUseLink/canSeeGroup): an element shows if EITHER
//   (a) the menu-access path admits it — effectiveMode is not 'hidden' (which already
//       folds in roleModes + the minAccess floor), OR
//   (b) the STAFF axis grants it — the element names a staffDomain the viewer's staff
//       role holds at the required level.
// Unioning is what keeps a staff-only operator (e.g. a Marketer whose community token
// collapses to 'member') seeing their domains, while never weakening a gate: a viewer
// who fails BOTH axes is hidden. Pages still re-gate server-side (requireAdmin), so a
// menu mistake can never grant page access.

/** An element carrying the gate fields — an item (full gate) or a category (gate +
 *  optional fields). Loose shape so both ResolvedItem and ResolvedCategory satisfy it. */
export type GateElement = {
  mode?: MenuMode
  roleModes?: Record<string, MenuMode>
  minAccess?: MenuAccess
  staffDomain?: StaffDomain
  staffLevel?: Access
}

/** The viewer, both axes: the collapsed MenuAccess token (community ladder + web_role)
 *  AND the fine-grained staff role (team_members, ADR-127). */
export type MenuViewer = { viewerRole: MenuAccess; staffRole?: StaffRole | null }

/** Default staff level required to SEE an element via the staff axis. A leaf link
 *  needs its own staffLevel (default 'write', matching canUseLink); a section/category
 *  floor only needs 'read' (matching canSeeGroup). */
function staffLevelFor(el: GateElement, kind: 'item' | 'category'): Access {
  return el.staffLevel ?? (kind === 'category' ? 'read' : 'write')
}

function passesStaffAxis(el: GateElement, viewer: MenuViewer, kind: 'item' | 'category'): boolean {
  return !!el.staffDomain && staffCan(viewer.staffRole ?? null, el.staffDomain, staffLevelFor(el, kind))
}

/** Does the viewer see this LEAF item? Union of the menu-access path and the staff axis. */
export function canSeeMenuItem(item: ResolvedItem, viewer: MenuViewer): boolean {
  if (passesStaffAxis(item, viewer, 'item')) return true
  return effectiveMode(item, viewer.viewerRole) !== 'hidden'
}

/** Does the viewer see this CATEGORY (a section / rail entry)? Union of its own
 *  minAccess floor and the staff axis. A category with no gate is visible to all. */
export function canSeeMenuCategory(cat: ResolvedCategory, viewer: MenuViewer): boolean {
  if (passesStaffAxis(cat, viewer, 'category')) return true
  return meetsMenuAccess(viewer.viewerRole, cat.minAccess ?? 'visitor')
}

/** Generic union gate over any GateElement (item or category). Prefer the typed
 *  canSeeMenuItem / canSeeMenuCategory at call sites; this is for mixed lists. */
export function canSeeMenuEl(
  el: GateElement,
  viewer: MenuViewer,
  kind: 'item' | 'category' = 'item',
): boolean {
  if (passesStaffAxis(el, viewer, kind)) return true
  if (kind === 'category') return meetsMenuAccess(viewer.viewerRole, el.minAccess ?? 'visitor')
  return (
    effectiveMode(
      { mode: el.mode ?? 'active', roleModes: el.roleModes ?? {}, minAccess: el.minAccess ?? 'visitor' },
      viewer.viewerRole,
    ) !== 'hidden'
  )
}
