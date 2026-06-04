// Single source of truth for the left-nav areas and the access level each one
// requires. Framework-independent (no icons / React) so it can be shared by:
//   • the app shell (which maps each key → a lucide icon), and
//   • the permission grid on /admin/roles (rows = these areas).
//
// `defaultAccess` is the baseline. A janitor can override any area's access from
// the permission grid; overrides persist in the `area_permissions` table and are
// merged on top of these defaults at request time (see lib/permissions.ts).

import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'
// Type-only — lib/staff is server-only (admin client); this import is erased at
// build, so nav-areas stays client-safe.
import type { StaffRole } from '@/lib/staff'

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
  /** Minimum STAFF role (team_members axis) that also unlocks this item, regardless
   *  of the trust-ladder `defaultAccess`. Used by the Studio group so the business
   *  cockpit rides the staff axis (ADR-027), not the community role. */
  staffAccess?: StaffRole
}

// Order here IS the render order down the rail (IA redesign, IA-STRATEGY.md ★ /
// ADR-095). FIVE member "worlds" anchored by Home — Community · Practice · Connect
// · The Quest — then Manage, split into the 4 axis-grouped sections (Steward /
// Structure / Studio / Platform), each telescoped at its floor role. Personal
// utilities (My Code, Help, Settings) live in the account menu, not the rail.
// Phase 1 = this re-grouping (no schema). Phase 2 = union the staff axis into nav
// visibility so Studio rides team_members; Phase 3 = persona-gated groups.
export const NAV_AREAS: readonly NavArea[] = [
  // ── Home anchor → pinned above the section groups ────────────────────────────
  { key: 'feed',      href: '/feed',      label: 'Feed',      section: null,        defaultAccess: 'member'  },

  // ── Community → belong & gather. Channels is the primary topical level;
  //    Interests live within a Channel. ─────────────────────────────────────────
  { key: 'circles',   href: '/circles',   label: 'Circles',   section: 'Community', defaultAccess: 'visitor' },
  { key: 'channels',  href: '/channels',  label: 'Channels',  section: 'Community', defaultAccess: 'visitor' },
  { key: 'events',    href: '/events',    label: 'Events',    section: 'Community', defaultAccess: 'member'  },

  // ── Practice → grow. The North-Star / WAM engine, its own world. ─────────────
  { key: 'practices', href: '/practices', label: 'Practices', section: 'Practice',  defaultAccess: 'member'  },
  { key: 'journeys',  href: '/journeys',  label: 'Journeys',  section: 'Practice',  defaultAccess: 'member'  },
  { key: 'programs',  href: '/programs',  label: 'Programs',  section: 'Practice',  defaultAccess: 'member'  },

  // ── Connect → your people ────────────────────────────────────────────────────
  { key: 'messages',  href: '/messages',  label: 'Messages',  section: 'Connect',   defaultAccess: 'member'  },
  { key: 'friends',   href: '/friends',   label: 'Friends',   section: 'Connect',   defaultAccess: 'member'  },
  { key: 'people',    href: '/people',    label: 'Directory', section: 'Connect',   defaultAccess: 'member'  },

  // ── The Quest → the game (preview for non-crew → full at crew/paid) ──────────
  { key: 'crew',      href: '/crew',       label: 'Dashboard',     section: 'The Quest', defaultAccess: 'crew', previewBelowAccess: true },
  { key: 'store',     href: '/crew/store', label: 'Store & Vault', section: 'The Quest', defaultAccess: 'crew', previewBelowAccess: true },

  // ── Manage → split by the axis that grants it (telescoped at each floor) ──────
  // Steward — community stewardship (trust host+, scoped to your circle/hub/nexus).
  { key: 'admin-community', href: '/admin',     label: 'Overview',  section: 'Steward', defaultAccess: 'host' },
  { key: 'crm',             href: '/crm',       label: 'CRM',       section: 'Steward', defaultAccess: 'host' },
  { key: 'outreach',        href: '/outreach',  label: 'Outreach',  section: 'Steward', defaultAccess: 'host' },
  // Structure — the place tree (trust guide/mentor).
  { key: 'admin-structure', href: '/admin/hubs', label: 'Hubs & Nexuses', section: 'Structure', defaultAccess: 'guide' },
  // Studio — the business cockpit. Rides the STAFF axis (team_members) in Phase 2;
  // gated 'admin' for now until nav visibility unions the staff axis.
  { key: 'marketing',       href: '/marketing', label: 'Marketing', section: 'Studio', defaultAccess: 'admin', staffAccess: 'analyst' },
  // Platform — operator controls (trust janitor).
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

// Staff axis (team_members) — local pure rank check so nav-areas stays client-safe
// (the server-only lib/staff isn't imported at runtime).
const STAFF_ORDER: readonly StaffRole[] = ['analyst', 'marketer', 'admin', 'owner']

/** Does the viewer's STAFF role (null = not staff) unlock this area via its
 *  `staffAccess` floor? Unioned with `meetsAccess` so an item shows if EITHER the
 *  trust ladder OR the staff axis grants it. */
export function meetsStaff(area: { staffAccess?: StaffRole }, staffRole: StaffRole | null): boolean {
  if (!area.staffAccess || staffRole == null) return false
  return STAFF_ORDER.indexOf(staffRole) >= STAFF_ORDER.indexOf(area.staffAccess)
}
