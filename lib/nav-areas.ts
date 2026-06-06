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
export const NAV_AREAS: readonly NavArea[] = [
  // ── Home → the two awareness surfaces, pinned headerless at the top ───────────
  { key: 'feed',      href: '/feed',      label: 'Feed',       section: null, defaultAccess: 'member' },
  { key: 'broadcast', href: '/broadcast', label: 'Around You', section: null, defaultAccess: 'member' },

  // ── Community → belong & gather (browse). Hubs/Nexuses stay contextual. ───────
  { key: 'circles',  href: '/circles',  label: 'Circles',     section: 'Community', defaultAccess: 'visitor' },
  { key: 'channels', href: '/channels', label: 'Channels',    section: 'Community', defaultAccess: 'visitor' },
  { key: 'events',   href: '/events',   label: 'Events',      section: 'Community', defaultAccess: 'member'  },
  { key: 'market',   href: '/market',   label: 'Marketplace', section: 'Community', defaultAccess: 'member'  },
  { key: 'people',   href: '/people',   label: 'People',      section: 'Community', defaultAccess: 'member'  },

  // ── Practice → the North-Star engine (Library folds into Practices, §10.4). ───
  { key: 'journeys',  href: '/journeys',  label: 'Journeys',  section: 'Practice', defaultAccess: 'member' },
  { key: 'practices', href: '/practices', label: 'Practices', section: 'Practice', defaultAccess: 'member' },
  { key: 'library',   href: '/library',   label: 'Library',   section: 'Practice', defaultAccess: 'member' },

  // ── Quest → the game; the Dashboard absorbs the /crew/* sub-pages as sections
  //    (§10.1). Crew-gated → preview for non-crew. ──────────────────────────────
  { key: 'crew',  href: '/crew',       label: 'Quest', section: 'Quest', defaultAccess: 'crew', previewBelowAccess: true },
  { key: 'store', href: '/crew/store', label: 'Store', section: 'Quest', defaultAccess: 'crew', previewBelowAccess: true },

  // ── Messages → DMs + rooms (Friends folds in, §10). ──────────────────────────
  { key: 'messages', href: '/messages', label: 'Messages', section: 'Messages', defaultAccess: 'member' },

  // ── Studio → community stewardship + business (host+/staff). Four sections
  //    collapsed to one; the launchpads (Overview, Growth) aggregate the rest. ───
  { key: 'admin-community', href: '/admin',       label: 'Overview',  section: 'Studio', defaultAccess: 'host' },
  { key: 'crm',             href: '/crm',         label: 'CRM',       section: 'Studio', defaultAccess: 'host' },
  { key: 'connections',     href: '/connections', label: 'Profiles',  section: 'Studio', defaultAccess: 'host', staffDomain: 'profiles' },
  { key: 'admin-qr',        href: '/admin/qr',    label: 'QR Studio', section: 'Studio', defaultAccess: 'host' },
  { key: 'admin-structure', href: '/admin/hubs',  label: 'Hubs & Nexuses', section: 'Studio', defaultAccess: 'guide' },
  // Growth Studio absorbs the old Marketing suite (IA §10.2): pages · onboarding ·
  // acquisition · pipeline · the marketing channels. The standalone Marketing item
  // retired; reachable by community admin+ OR a staff role with the 'marketing'
  // capability — the same gate the suite used (lib/page-editor/guard.ts).
  { key: 'growth',          href: '/growth',      label: 'Growth Studio', section: 'Studio', defaultAccess: 'admin', staffDomain: 'marketing' },

  // ── Platform → sensitive operator keys (janitor). ────────────────────────────
  { key: 'admin-insights',  href: '/admin/engagement', label: 'Insights', section: 'Platform', defaultAccess: 'janitor' },
  { key: 'admin-vera',      href: '/admin/vera',       label: 'Vera',     section: 'Platform', defaultAccess: 'janitor' },
  { key: 'admin-platform',  href: '/admin/members',    label: 'Members',  section: 'Platform', defaultAccess: 'janitor' },
  { key: 'pages',           href: '/pages',            label: 'Pages',    section: 'Platform', defaultAccess: 'janitor' },
] as const

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
