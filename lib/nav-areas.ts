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

// Order here IS the render order down the rail (Feed + Messages anchors, then
// the three pillars — Community, The Quest, Network — then Manage).
export const NAV_AREAS: readonly NavArea[] = [
  // ── Top-level anchors → pinned above the section groups ──────────────────────
  // Feed is "home": the default landing and the day-to-day social loop. Messages
  // sits right beside it as a second anchor — DMs are personal, not community
  // content — so both carry section: null and read as the rail's home block.
  { key: 'feed',      href: '/feed',      label: 'Feed',      section: null,        defaultAccess: 'member'  },
  { key: 'messages',  href: '/messages',  label: 'Messages',  section: null,        defaultAccess: 'member'  },

  // ── Community → the places you belong + the live comms loop ─────────────────
  { key: 'broadcast', href: '/broadcast', label: 'Broadcasts', section: 'Community', defaultAccess: 'visitor' },
  { key: 'circles',   href: '/circles',   label: 'Circles',   section: 'Community', defaultAccess: 'visitor' },
  { key: 'channels',  href: '/channels',  label: 'Channels',  section: 'Community', defaultAccess: 'visitor' },
  { key: 'events',    href: '/events',    label: 'Events',    section: 'Community', defaultAccess: 'member'  },

  // ── The Quest → the gamified progression loop ───────────────────────────────
  { key: 'crew',      href: '/crew',       label: 'Dashboard', section: 'The Quest', defaultAccess: 'crew'    },
  { key: 'arcs',      href: '/crew/arcs',  label: 'Arcs',      section: 'The Quest', defaultAccess: 'crew'    },
  { key: 'store',     href: '/crew/store', label: 'Store',     section: 'The Quest', defaultAccess: 'crew'    },
  { key: 'vault',     href: '/vault',      label: 'Vault',     section: 'The Quest', defaultAccess: 'member'  },

  // ── Network → people, practices, programs, partners ─────────────────────────
  { key: 'practices', href: '/practices', label: 'Practices', section: 'Network',   defaultAccess: 'member'  },
  { key: 'programs',  href: '/programs',  label: 'Programs',  section: 'Network',   defaultAccess: 'member'  },
  { key: 'friends',   href: '/friends',   label: 'Friends',   section: 'Network',   defaultAccess: 'member'  },
  { key: 'partners',  href: '/partners',  label: 'Partners',  section: 'Network',   defaultAccess: 'member'  },
  { key: 'people',    href: '/people',    label: 'Directory', section: 'Network',   defaultAccess: 'member'  },

  // ── Manage ──────────────────────────────────────────────────────────────────
  // The admin surface is split into its five categories (the groups in
  // app/(main)/admin/sections.ts) so each is a primary entry in the rail; the
  // active category's pages render as a short sub-tab strip (two-layer nav). Each
  // category deep-links to its landing page and gates at the group's floor role.
  { key: 'admin-community', href: '/admin',            label: 'Community', section: 'Manage', defaultAccess: 'host'    },
  { key: 'admin-structure', href: '/admin/hubs',       label: 'Structure', section: 'Manage', defaultAccess: 'guide'   },
  { key: 'admin-insights',  href: '/admin/engagement', label: 'Insights',  section: 'Manage', defaultAccess: 'janitor' },
  { key: 'admin-vera',      href: '/admin/vera',       label: 'Vera',      section: 'Manage', defaultAccess: 'janitor' },
  { key: 'admin-platform',  href: '/admin/members',    label: 'Platform',  section: 'Manage', defaultAccess: 'janitor' },
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
