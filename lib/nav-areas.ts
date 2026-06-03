// Single source of truth for the left-nav areas and the access level each one
// requires. Framework-independent (no icons / React) so it can be shared by:
//   • the app shell (which maps each key → a lucide icon), and
//   • the permission grid on /admin/roles (rows = these areas).
//
// `defaultAccess` is the baseline. A janitor can override any area's access from
// the permission grid; overrides persist in the `area_permissions` table and are
// merged on top of these defaults at request time (see lib/permissions.ts).

import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'

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
}

// Order here IS the render order down the rail (Feed, then each section).
export const NAV_AREAS: readonly NavArea[] = [
  // ── Home anchor → pinned to the very top of the rail ─────────────────────────
  // Feed is "home": the default landing and the day-to-day social loop. It sits
  // alone above the section groups (section: null) so it reads as the anchor.
  { key: 'feed',      href: '/feed',      label: 'Feed',      section: null,        defaultAccess: 'member'  },

  // ── Broadcast → the live comms loop, just under Feed ────────────────────────
  { key: 'broadcast', href: '/broadcast', label: 'Dispatches', section: 'Broadcast', defaultAccess: 'visitor' },
  { key: 'messages',  href: '/messages',  label: 'Messages',  section: 'Broadcast', defaultAccess: 'member'  },
  { key: 'events',    href: '/events',    label: 'Events',    section: 'Broadcast', defaultAccess: 'member'  },

  // ── Community spaces ────────────────────────────────────────────────────────
  { key: 'circles',   href: '/circles',   label: 'Circles',   section: 'Community', defaultAccess: 'visitor' },
  { key: 'channels',  href: '/channels',  label: 'Interests', section: 'Community', defaultAccess: 'visitor' },

  // ── Features ────────────────────────────────────────────────────────────────
  { key: 'practices', href: '/practices', label: 'Practices', section: 'Library',   defaultAccess: 'member'  },
  { key: 'programs',  href: '/programs',  label: 'Programs',  section: 'Library',   defaultAccess: 'member'  },

  { key: 'friends',   href: '/friends',   label: 'Friends',   section: 'Network',   defaultAccess: 'member'  },
  { key: 'partners',  href: '/partners',  label: 'Partners',  section: 'Network',   defaultAccess: 'member'  },
  { key: 'people',    href: '/people',    label: 'Directory', section: 'Network',   defaultAccess: 'member'  },

  { key: 'crew',      href: '/crew',      label: 'Dashboard', section: 'Progress',  defaultAccess: 'crew'    },
  { key: 'vault',     href: '/vault',     label: 'Vault',     section: 'Progress',  defaultAccess: 'member'  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  { key: 'admin',     href: '/admin',     label: 'Admin',     section: 'Manage',    defaultAccess: 'host'    },
  { key: 'crm',       href: '/crm',       label: 'CRM',       section: 'Manage',    defaultAccess: 'host'    },
  { key: 'marketing', href: '/marketing', label: 'Marketing', section: 'Manage',    defaultAccess: 'admin'   },
  { key: 'outreach',  href: '/outreach',  label: 'Outreach',  section: 'Manage',    defaultAccess: 'host'    },
  { key: 'pages',     href: '/pages',     label: 'Pages',     section: 'Manage',    defaultAccess: 'admin'   },
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
