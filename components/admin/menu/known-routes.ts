// Shared, framework-free constants for the Menu Manager client UI. Kept out of the
// component files so they import cleanly into any of the editor pieces, and so the
// curated route list lives in one place. NO server imports here.

import type { MenuAccess, MenuMode, MenuSurfaceKey } from '@/lib/menus/types'

// Which surfaces render as a true grid (so column / row / span placement is meaningful)
// vs. a linear list. The left rail, footer, and profile menu are linear lists, so their
// grid-placement controls are hidden (point 4); only the header mega-menu is a grid.
const GRID_SURFACES: readonly MenuSurfaceKey[] = ['header']

/** Does this surface lay items out on a grid (vs. a linear list)? */
export function isGridSurface(surfaceKey: MenuSurfaceKey): boolean {
  return (GRID_SURFACES as readonly string[]).includes(surfaceKey)
}

// Client-safe surface labels for the "Move to…" control (lib/menus/read.ts is server-only,
// so client editors can't import MENU_SURFACES from there). Keep in sync with MENU_SURFACES.
export const MENU_SURFACE_LABELS: Record<MenuSurfaceKey, string> = {
  header: 'Header menu',
  left: 'Left menu',
  footer: 'Footer menu',
  profile: 'Profile menu',
}

// A curated set of known in-app routes offered as a <datalist> in the link-target
// field. Free-typed custom URLs (external links, anchors) are still allowed; this is
// only an autocomplete convenience, never a hard allowlist. Keep it short and useful
// (the common destinations an operator points a menu at), not every route in the app.
export const KNOWN_ROUTES: { href: string; label: string }[] = [
  { href: '/feed', label: 'Feed' },
  { href: '/circles', label: 'Circles' },
  { href: '/events', label: 'Events' },
  { href: '/channels', label: 'Channels' },
  { href: '/practices', label: 'Practices' },
  { href: '/journeys', label: 'Journeys' },
  { href: '/library', label: 'Library' },
  { href: '/people', label: 'People' },
  { href: '/connections', label: 'Connections' },
  { href: '/messages', label: 'Messages' },
  { href: '/spaces', label: 'Spaces' },
  { href: '/programs', label: 'Programs' },
  { href: '/market', label: 'Market' },
  { href: '/crew', label: 'Crew' },
  { href: '/lead', label: 'Lead' },
  { href: '/network', label: 'Network' },
  { href: '/search', label: 'Search' },
  { href: '/support', label: 'Support' },
  { href: '/settings', label: 'Settings' },
  { href: '/settings/profile', label: 'Settings: Profile' },
  { href: '/settings/billing', label: 'Settings: Billing' },
  { href: '/settings/notifications', label: 'Settings: Notifications' },
  { href: '/upgrade', label: 'Upgrade' },
  { href: '/founder', label: 'Founder' },
  { href: '/admin', label: 'Admin home' },
  { href: '/admin/members', label: 'Admin: Members' },
  { href: '/admin/circles', label: 'Admin: Circles' },
  { href: '/admin/events', label: 'Admin: Events' },
  { href: '/admin/roles', label: 'Admin: Roles & permissions' },
  { href: '/admin/menu', label: 'Admin: Menu manager' },
  { href: '/admin/insights', label: 'Admin: Insights' },
]

// The MenuAccess ladder in display order, with human labels (NAMING canon). 'visitor'
// is the open floor (everyone, even logged out); the rest mirror the community roles
// plus the two staff tiers. Used by the per-item role controls.
export const ACCESS_ORDER: readonly MenuAccess[] = [
  'visitor',
  'member',
  'crew',
  'host',
  'guide',
  'mentor',
  'admin',
  'janitor',
]

export const ACCESS_LABEL: Record<MenuAccess, string> = {
  visitor: 'Visitor',
  member: 'Member',
  crew: 'Crew',
  host: 'Host',
  guide: 'Guide',
  mentor: 'Mentor',
  admin: 'Admin',
  janitor: 'Janitor',
}

// The roles that get a per-role mode override (the role_modes matrix). Same ladder as
// access, because any viewer in one of these buckets may want a different presentation
// for a given item.
export const ROLE_ORDER: readonly MenuAccess[] = ACCESS_ORDER

export const MODE_ORDER: readonly MenuMode[] = ['active', 'ghost', 'hidden']

export const MODE_LABEL: Record<MenuMode, string> = {
  active: 'Active',
  ghost: 'Ghost',
  hidden: 'Hidden',
}

// Compact mode glyph for the per-role matrix cells, so the grid stays scannable.
export const MODE_SHORT: Record<MenuMode, string> = {
  active: 'A',
  ghost: 'G',
  hidden: 'H',
}
