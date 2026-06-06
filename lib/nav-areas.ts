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
export const NAV_AREAS: readonly NavArea[] = [
  // ── Home base → the two awareness surfaces, pinned headerless at the top ──────
  { key: 'feed',      href: '/feed',      label: 'Feed',       section: null, defaultAccess: 'member' },
  { key: 'broadcast', href: '/broadcast', label: 'Around You', section: null, defaultAccess: 'member' },

  // ── Practice → the North-Star engine, its own world so the "what do I do"
  //    content reads separately from the game it feeds. Open to everyone. ────────
  { key: 'journeys',  href: '/journeys',  label: 'Journeys',  section: 'Practice', defaultAccess: 'member' },
  { key: 'practices', href: '/practices', label: 'Practices', section: 'Practice', defaultAccess: 'member' },
  { key: 'library',   href: '/library',   label: 'Library',   section: 'Practice', defaultAccess: 'member' },

  // ── Community → belong & gather. Hubs/Nexuses are contextual, never rail. ─────
  { key: 'circles',  href: '/circles',  label: 'Circles',   section: 'Community', defaultAccess: 'visitor' },
  { key: 'channels', href: '/channels', label: 'Channels',  section: 'Community', defaultAccess: 'visitor' },
  { key: 'events',   href: '/events',   label: 'Events',    section: 'Community', defaultAccess: 'member'  },
  { key: 'market',   href: '/market',   label: 'Marketplace', section: 'Community', defaultAccess: 'member' },
  { key: 'people',   href: '/people',   label: 'Directory', section: 'Community', defaultAccess: 'member'  },

  // ── The Quest → the game + shop. Practice content now lives in its own world;
  //    the Dashboard and Store stay here. Crew-gated → preview for non-crew. ─────
  { key: 'crew',  href: '/crew',       label: 'Dashboard', section: 'The Quest', defaultAccess: 'crew', previewBelowAccess: true },
  { key: 'store', href: '/crew/store', label: 'Store',     section: 'The Quest', defaultAccess: 'crew', previewBelowAccess: true },

  // ── Manage → four axis-gated worlds, each telescoped at its floor (IA step 2):
  //    Steward (host stewardship) · Structure (the place tree) · Studio (the staff
  //    business cockpit, on the team_members axis) · Platform (operator keys). ─────
  // Steward — community stewardship (trust host+).
  { key: 'admin-community', href: '/admin',       label: 'Overview',  section: 'Steward', defaultAccess: 'host' },
  { key: 'crm',             href: '/crm',         label: 'CRM',       section: 'Steward', defaultAccess: 'host' },
  // Profile Creator — owner-scoped network intake (card scan / manual + Vera).
  // Host+ on the trust ladder, OR Studio staff (team_members axis), per ADR-098.
  { key: 'connections',     href: '/connections', label: 'Profiles',  section: 'Steward', defaultAccess: 'host', staffDomain: 'profiles' },
  { key: 'admin-qr',        href: '/admin/qr',    label: 'QR Studio', section: 'Steward', defaultAccess: 'host' },
  // Structure — the place tree that circles cluster into (trust guide/mentor).
  { key: 'admin-structure', href: '/admin/hubs',  label: 'Hubs & Nexuses', section: 'Structure', defaultAccess: 'guide' },
  // Studio — the business cockpit, on the STAFF axis (ADR-127): shown to staff
  // marketers regardless of trust role, or to trust admin+.
  { key: 'marketing',       href: '/marketing',   label: 'Marketing', section: 'Studio', defaultAccess: 'admin', staffDomain: 'marketing' },
  // Platform — sensitive operator keys (trust janitor).
  { key: 'admin-insights',  href: '/admin/engagement', label: 'Insights', section: 'Platform', defaultAccess: 'janitor' },
  { key: 'admin-vera',      href: '/admin/vera',       label: 'Vera',     section: 'Platform', defaultAccess: 'janitor' },
  { key: 'admin-platform',  href: '/admin/members',    label: 'Members',  section: 'Platform', defaultAccess: 'janitor' },
  { key: 'growth',          href: '/growth',           label: 'Growth Studio', section: 'Platform', defaultAccess: 'janitor' },
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
