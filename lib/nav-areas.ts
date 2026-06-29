// Single source of truth for the left-nav areas and the access level each one
// requires. Framework-independent (no icons / React) so it can be shared by:
//   • the app shell (which maps each key → a lucide icon), and
//   • the permission grid on /admin/roles (rows = these areas).
//
// `defaultAccess` is the baseline. A janitor can override any area's access from
// the permission grid; overrides persist in the `area_permissions` table and are
// merged on top of these defaults at request time (see lib/permissions.ts).

import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'
// The staff model is client-safe (lib/core/staff-roles), so nav-areas can use the
// capability check directly. (lib/staff is the server-only wrapper.)
import { staffCan, type StaffRole, type StaffDomain } from '@/lib/core/staff-roles'
// The vertical registry contributes nav areas (e.g. Marketplace). Type-only on the way
// back (verticals imports NavArea as a type), so this is a one-way runtime dependency.
import { verticalNavPlacements, type NavPlacement } from '@/lib/verticals'

// Access levels, lowest → highest. 'visitor' = everyone (even logged-out); the
// rest map onto the community-role ladder.
export type NavAccess = 'visitor' | CommunityRole

export const ACCESS_LEVELS: readonly NavAccess[] = ['visitor', ...ROLE_HIERARCHY] as const

// The in-app nav is a SINGLE vertical rail (the left sidebar). Feed is the rail's
// home anchor (pinned to the very top, above the section groups); below it sit
// the Broadcast comms loop, community spaces, features, and admin — grouped by
// `section`. The full-site browse nav (PrimaryNav) is separate (lives in header).

export type NavArea = {
  /** Stable key — used as the area_permissions primary key. */
  key: string
  href: string
  label: string
  /** Section header — groups the rail and the permission grid. */
  section: string | null
  defaultAccess: NavAccess
  /** When a viewer is BELOW the required access, still let them click through to
   *  browse the page in preview (muted), rather than greying it out. The page then
   *  gates earning/spending behind an upgrade prompt. Used for the Quest. */
  previewBelowAccess?: boolean
  /** STAFF capability domain (team_members axis, ADR-127) that also unlocks this
   *  item — regardless of the trust-ladder `defaultAccess`. The business cockpit
   *  rides the staff axis (ADR-027), gated by capability not community role. */
  staffDomain?: StaffDomain
  /** The surface this item maps to in lib/core/access-matrix.ts — the function-level
   *  permission view (none/limited/full per the owner sheet). Documentation + the seam
   *  for matrix-driven nav gating; `defaultAccess` is the live visibility gate today. */
  surface?: string
}

// Order here IS the render order down the rail. FIVE worlds (IA plan, 2026-06-06):
//   Home (Feed + Around You, pinned headerless at the very top) · Practice (the
//   North-Star engine, lifted out of The Quest) · Community · The Quest (game +
//   shop) · then Manage — Steward (host+) and Platform (janitor), each telescoped.
// Messages/Notifications/Search live in the header; Friends + personal utilities
// (My Code, Help, Settings) in the account menu. Step 2 splits Manage further into
// Steward / Structure / Studio / Platform. Programs left the rail — its leader-
// training materials now live under Steward › Crew tasks (see admin/sections.ts).
// Order here IS the render order down the rail. Categorical IA (ADR-approved
// 2026-06-06, IA-RESTRUCTURE.md §10): Home · Community · Practice · Quest · Messages
// (member), then the operator world collapsed from four sections (Steward /
// Structure / Studio / Platform) into two: **Studio** (host+/staff stewardship +
// business) and **Platform** (janitor operator keys). Deeper page-level dashboard
// merges (Quest sections, Network unification, Marketing→Growth) follow as §10.2+.
// Order + sections + labels are the owner's Roles & Permissions sheet (2026-06-08): four
// worlds — Community · The Quest · Studio · Platform. `surface` ties each item to the
// access matrix (the function-level permission view); `defaultAccess` is the live nav
// visibility gate.
const BASE_NAV_AREAS: readonly NavArea[] = [
  // ── Home anchor (headerless, pinned at the very top above the worlds) ─────────
  // Feed leads the rail in its own label-less group; the shell drops the member's
  // Profile in beside it (dynamic href, so it's injected at render time).
  { key: 'feed',          href: '/feed',      label: 'Feed',         section: null,        defaultAccess: 'visitor', surface: 'feed' },

  // ── Community ────────────────────────────────────────────────────────────────
  { key: 'broadcast',     href: '/broadcast', label: 'Around You',   section: 'Community', defaultAccess: 'visitor', surface: 'broadcast' },
  { key: 'circles',       href: '/circles',   label: 'Circles',      section: 'Community', defaultAccess: 'visitor', surface: 'circles' },
  { key: 'channels',      href: '/channels',  label: 'Channels',     section: 'Community', defaultAccess: 'visitor', surface: 'channels' },
  { key: 'events',        href: '/events',    label: 'Events',       section: 'Community', defaultAccess: 'visitor', surface: 'events' },
  // 'market' is contributed by the Marketplace vertical and composed in below
  // (after 'events') — see composeNavAreas. It is intentionally NOT a literal here.
  { key: 'messageBoards', href: '/messages',  label: 'Message Boards', section: 'Community', defaultAccess: 'member', surface: 'messageBoards' },
  { key: 'people',        href: '/network',   label: 'Community',    section: 'Community', defaultAccess: 'member',  surface: 'people' },
  // Re-homed orphan (E.1): the contacts list lives in the Network hub as My Contacts (ADR-172) —
  // /connections redirects there. Surfaced here so members reach their connections from the rail.
  { key: 'connections',   href: '/network/contacts', label: 'My Contacts', section: 'Community', defaultAccess: 'member', surface: 'people' },

  // ── The Quest → everyone plays; only the Vault (cash-in) is paid-gated ────────
  { key: 'quest',     href: '/crew',       label: 'My Quest', section: 'The Quest', defaultAccess: 'member', surface: 'quest' },
  { key: 'journeys',   href: '/journeys',        label: 'Journeys',   section: 'The Quest', defaultAccess: 'member', surface: 'journeys' },
  { key: 'practices',  href: '/practices',       label: 'Practices',  section: 'The Quest', defaultAccess: 'member', surface: 'practices' },
  // Re-homed orphans (E.1). Library = the community's practices/programs/journeys catalog; Journal =
  // your own captured-moments log (the personal face of Capture). Both are member-content surfaces,
  // so they live with the Quest engine rather than floating routeless.
  { key: 'library',    href: '/library',         label: 'Library',    section: 'The Quest', defaultAccess: 'member', surface: 'library' },
  // Journal is a member-only PERSONAL log (no matrix surface of its own); ride the `people` row
  // ({ member: 'full' }, visitor hidden) so it gates exactly like the other member-only surfaces.
  { key: 'journal',    href: '/journal',         label: 'Journal',    section: 'The Quest', defaultAccess: 'member', surface: 'people' },
  { key: 'vault',      href: '/crew/store',      label: 'The Vault',  section: 'The Quest', defaultAccess: 'member', previewBelowAccess: true, surface: 'vault' },

  // ── Admin → the operator world. Telescopes: only the items a role/staff axis can
  // reach are shown; the rest are hidden, not ghosted. Most areas are STAFF-ADMIN gated
  // (platformManage: admin/janitor full), so a member/paid never sees them. EXCEPTIONS
  // that admit host+ on the community ladder: Leadership (the leader home, surface
  // 'lead') and Programs/Community/Growth via their community/marketing staff domain.
  { key: 'admin-home',       href: '/admin',            label: 'Dashboard',  section: 'Admin', defaultAccess: 'admin',   surface: 'platformManage' },
  { key: 'admin-community',  href: '/admin/community',  label: 'Community',  section: 'Admin', defaultAccess: 'host',    staffDomain: 'community',  surface: 'platformManage' },
  { key: 'lead',             href: '/lead',             label: 'Leadership', section: 'Admin', defaultAccess: 'host',    surface: 'lead' },
  { key: 'admin-programs',   href: '/admin/programs',   label: 'Programs',   section: 'Admin', defaultAccess: 'host',    staffDomain: 'community',  surface: 'platformManage' },
  { key: 'admin-growth',     href: '/admin/growth',     label: 'Growth',     section: 'Admin', defaultAccess: 'host',    staffDomain: 'marketing', surface: 'growthStudio' },
  // Resonance CRM (ADR-382 to 387): the Vera-driven CRM domain. THIS is the entry that puts it in the
  // left rail (the rail reads NAV_AREAS only; sections.ts + nav.ts feed the dashboard switcher + the
  // sub-header, not the rail). Gated 'janitor' to match the cockpit's per-member-prediction sensitivity.
  { key: 'admin-crm',        href: '/admin/crm',        label: 'Resonance CRM', section: 'Admin', defaultAccess: 'janitor', surface: 'platformManage' },
  { key: 'admin-vera-ai',    href: '/admin/vera-ai',    label: 'Vera AI',    section: 'Admin', defaultAccess: 'janitor', staffDomain: 'insights',  surface: 'platformManage' },
  { key: 'admin-operations', href: '/admin/operations', label: 'Operations', section: 'Admin', defaultAccess: 'janitor', staffDomain: 'platform',  surface: 'platformManage' },
  { key: 'admin-qr',         href: '/admin/qr',         label: 'QR Studio',  section: 'Admin', defaultAccess: 'admin',   staffDomain: 'qr',        surface: 'platformManage' },
  // Spaces — the operator directory of entity Spaces. Gated EXACTLY like QR Studio above:
  // community admin/janitor (defaultAccess 'admin' = the top of the ladder) OR platform-capable
  // staff (staffDomain 'platform'), so only Admin + Janitor see it. Telescopes like the rest of
  // the Admin section (hidden, not ghosted, for everyone below).
  { key: 'admin-spaces',     href: '/admin/spaces',     label: 'Spaces',     section: 'Admin', defaultAccess: 'admin',   staffDomain: 'platform',  surface: 'platformManage' },
  { key: 'admin-marketplace', href: '/admin/marketplace', label: 'Marketplace', section: 'Admin', defaultAccess: 'admin', staffDomain: 'platform', surface: 'platformManage' },
  // Personal Settings is NOT an admin tool — every logged-in member reaches it from the
  // profile card (bottom-left) + /settings. It deliberately no longer sits under "Admin".
] as const

// Compose the base areas with the vertical-contributed ones (ADR-250 step 4). Each
// vertical placement is spliced in immediately after its `after` key, so a vertical's nav
// lands inside its section's consecutive run (the shell groups nav by consecutive section,
// so a naive append would fork a second section header). Adding a vertical with nav = its
// descriptor declares the area; nothing here changes.
function composeNavAreas(): NavArea[] {
  const areas: NavArea[] = [...BASE_NAV_AREAS]
  // Defense-in-depth (incident 2026-06-24): NAV_AREAS is computed at module load and read by
  // the shared app shell on EVERY route, so a malformed/throwing vertical placement must never
  // be fatal. A bad placement is skipped; the rest of the nav still composes.
  let placements: NavPlacement[] = []
  try {
    placements = verticalNavPlacements()
  } catch {
    placements = []
  }
  for (const { area, after } of placements) {
    try {
      if (!area?.key) continue
      if (areas.some((a) => a.key === area.key)) continue // a base literal already provides it
      const at = after ? areas.findIndex((a) => a.key === after) : -1
      if (at >= 0) areas.splice(at + 1, 0, area)
      else areas.push(area)
    } catch {
      /* skip a single bad placement, keep the rest of the nav */
    }
  }
  return areas
}

/** The full nav (base + vertical-contributed), the single source the shell + grid read. */
export const NAV_AREAS: readonly NavArea[] = composeNavAreas()

/** Quick lookup of an area's baseline access by key. */
export const NAV_AREA_DEFAULTS: Record<string, NavAccess> = Object.fromEntries(
  NAV_AREAS.map((a) => [a.key, a.defaultAccess]),
)

/** Can a viewer with `role` (null = logged-out) USE an area gated at `access`? */
export function meetsAccess(access: NavAccess, role: CommunityRole | null): boolean {
  if (access === 'visitor') return true
  if (role == null) return false
  if (access === 'member') return true
  // access is now one of crew/host/guide/mentor/admin/janitor — a ladder rank.
  return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(access)
}

/** Does the viewer's STAFF role (null = not staff) unlock this area via its
 *  `staffDomain` capability? Unioned with `meetsAccess` so an item shows if EITHER
 *  the trust ladder OR the staff axis grants it (read is enough to surface nav). */
export function meetsStaff(area: { staffDomain?: StaffDomain }, staffRole: StaffRole | null): boolean {
  if (!area.staffDomain || staffRole == null) return false
  return staffCan(staffRole, area.staffDomain, 'read')
}
