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

// Where an area lives in the in-app chrome:
//   • 'community' → the horizontal sub-menu under the header (primary community
//      interaction: the day-to-day social loop), and
//   • 'sidebar'   → the left rail (features + admin / management).
// The full-site browse nav (PrimaryNav) is separate and lives in the header.
export type NavPlacement = 'community' | 'sidebar'

export type NavArea = {
  /** Stable key — used as the area_permissions primary key. */
  key: string
  href: string
  label: string
  /** Section header — groups the sidebar rail and the permission grid. */
  section: string | null
  /** Which in-app nav surface this area renders in. */
  placement: NavPlacement
  defaultAccess: NavAccess
}

// Order here IS the render order (community bar, then sidebar by section).
export const NAV_AREAS: readonly NavArea[] = [
  // ── Primary community interaction → the horizontal bar under the header ──────
  { key: 'feed',      href: '/feed',      label: 'Feed',      section: null,        placement: 'community', defaultAccess: 'member'  },
  { key: 'circles',   href: '/circles',   label: 'Circles',   section: 'Community', placement: 'community', defaultAccess: 'visitor' },
  { key: 'channels',  href: '/channels',  label: 'Interests', section: 'Community', placement: 'community', defaultAccess: 'visitor' },
  { key: 'events',    href: '/events',    label: 'Events',    section: 'Community', placement: 'community', defaultAccess: 'member'  },
  { key: 'broadcast', href: '/broadcast', label: 'Broadcast', section: 'Connect',   placement: 'community', defaultAccess: 'visitor' },
  { key: 'messages',  href: '/messages',  label: 'Messages',  section: 'Connect',   placement: 'community', defaultAccess: 'member'  },

  // ── Features + admin → the left sidebar ─────────────────────────────────────
  { key: 'practices', href: '/practices', label: 'Practices', section: 'Library',   placement: 'sidebar',   defaultAccess: 'member'  },
  { key: 'programs',  href: '/programs',  label: 'Programs',  section: 'Library',   placement: 'sidebar',   defaultAccess: 'member'  },

  { key: 'friends',   href: '/friends',   label: 'Friends',   section: 'Network',   placement: 'sidebar',   defaultAccess: 'member'  },
  { key: 'partners',  href: '/partners',  label: 'Partners',  section: 'Network',   placement: 'sidebar',   defaultAccess: 'member'  },
  { key: 'people',    href: '/people',    label: 'Directory', section: 'Network',   placement: 'sidebar',   defaultAccess: 'member'  },

  { key: 'crew',      href: '/crew',      label: 'Dashboard', section: 'Progress',  placement: 'sidebar',   defaultAccess: 'crew'    },
  { key: 'vault',     href: '/vault',     label: 'Vault',     section: 'Progress',  placement: 'sidebar',   defaultAccess: 'member'  },

  { key: 'admin',     href: '/admin',     label: 'Admin',     section: 'Manage',    placement: 'sidebar',   defaultAccess: 'host'    },
  { key: 'crm',       href: '/crm',       label: 'CRM',       section: 'Manage',    placement: 'sidebar',   defaultAccess: 'host'    },
  { key: 'marketing', href: '/marketing', label: 'Marketing', section: 'Manage',    placement: 'sidebar',   defaultAccess: 'admin'   },
  { key: 'outreach',  href: '/outreach',  label: 'Outreach',  section: 'Manage',    placement: 'sidebar',   defaultAccess: 'host'    },
  { key: 'pages',     href: '/pages',     label: 'Pages',     section: 'Manage',    placement: 'sidebar',   defaultAccess: 'admin'   },
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
