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
  /** The surface this item maps to in lib/core/access-matrix.ts — the function-level
   *  permission view (none/limited/full per the owner sheet). Documentation + the seam
   *  for matrix-driven nav gating; `defaultAccess` is the live visibility gate today. */
  surface?: string
  /** Item is in the menu but its page isn't built yet — renders the Coming Soon stub. */
  comingSoon?: boolean
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
// visibility gate. Items whose page isn't built yet carry `comingSoon`.
export const NAV_AREAS: readonly NavArea[] = [
  // ── Community ────────────────────────────────────────────────────────────────
  { key: 'feed',          href: '/feed',      label: 'Feed',         section: 'Community', defaultAccess: 'visitor', surface: 'feed' },
  { key: 'broadcast',     href: '/broadcast', label: 'Around You',   section: 'Community', defaultAccess: 'visitor', surface: 'broadcast' },
  { key: 'circles',       href: '/circles',   label: 'Circles',      section: 'Community', defaultAccess: 'visitor', surface: 'circles' },
  { key: 'channels',      href: '/channels',  label: 'Channels',     section: 'Community', defaultAccess: 'visitor', surface: 'channels' },
  { key: 'events',        href: '/events',    label: 'Events',       section: 'Community', defaultAccess: 'visitor', surface: 'events' },
  { key: 'market',        href: '/market',    label: 'Marketplace',  section: 'Community', defaultAccess: 'visitor', surface: 'market' },
  { key: 'messageBoards', href: '/messages',  label: 'Message Boards', section: 'Community', defaultAccess: 'member', surface: 'messageBoards' },
  { key: 'people',        href: '/network',   label: 'Network',      section: 'Community', defaultAccess: 'member',  surface: 'people' },

  // ── The Quest → everyone plays; only the Vault (cash-in) is paid-gated ────────
  { key: 'quest',     href: '/crew',       label: 'Dashboard', section: 'The Quest', defaultAccess: 'member', surface: 'quest' },
  { key: 'journeys',  href: '/journeys',   label: 'Journeys',  section: 'The Quest', defaultAccess: 'member', surface: 'journeys' },
  { key: 'practices', href: '/practices',  label: 'Practices', section: 'The Quest', defaultAccess: 'member', surface: 'practices' },
  { key: 'library',   href: '/library',    label: 'Library',   section: 'The Quest', defaultAccess: 'member', surface: 'library' },
  { key: 'vault',     href: '/crew/store', label: 'The Vault', section: 'The Quest', defaultAccess: 'crew', previewBelowAccess: true, surface: 'vault' },

  // ── Studio → stewardship + the partner business block ────────────────────────
  { key: 'admin-community', href: '/admin',         label: 'Overview',      section: 'Studio', defaultAccess: 'host', surface: 'studioOverview' },
  { key: 'admin-support',   href: '/admin/support', label: 'Support',       section: 'Studio', defaultAccess: 'member', surface: 'support' },
  // Personal contacts (surface 'personalCrm') folded into the Network hub's
  // "My Contacts" tab (ADR-172) — reached via Community › Network, not a Studio entry.
  { key: 'crm',             href: '/crm',           label: 'CRM Pipeline',  section: 'Studio', defaultAccess: 'admin', surface: 'businessCrm' },
  { key: 'website',         href: '/coming-soon?feature=website',     label: 'Website',       section: 'Studio', defaultAccess: 'admin', surface: 'website', comingSoon: true },
  { key: 'hook-network',    href: '/coming-soon?feature=hook',        label: 'Hook Network',  section: 'Studio', defaultAccess: 'admin', surface: 'hookNetwork', comingSoon: true },
  { key: 'growth',          href: '/growth',        label: 'Growth Studio', section: 'Studio', defaultAccess: 'admin', staffDomain: 'marketing', surface: 'growthStudio' },
  { key: 'earnings',        href: '/coming-soon?feature=finances',    label: 'Finances',      section: 'Studio', defaultAccess: 'admin', surface: 'earnings', comingSoon: true },
  { key: 'admin-qr',        href: '/admin/qr',      label: 'QR Studio',     section: 'Studio', defaultAccess: 'member', previewBelowAccess: true, surface: 'qrStudio' },

  // ── Platform → operator keys ─────────────────────────────────────────────────
  { key: 'status',         href: '/admin',            label: 'Admin',       section: 'Platform', defaultAccess: 'host', surface: 'status' },
  { key: 'admin-insights', href: '/admin/engagement', label: 'Insight',     section: 'Platform', defaultAccess: 'host', surface: 'insight' },
  { key: 'admin-vera',     href: '/admin/vera',       label: 'Vera AI',     section: 'Platform', defaultAccess: 'host', surface: 'veraAi' },
  { key: 'admin-structure', href: '/admin/hubs',      label: 'Hubs & Nexuses', section: 'Platform', defaultAccess: 'admin', surface: 'platformManage' },
  { key: 'admin-platform', href: '/admin/members',    label: 'Memberships', section: 'Platform', defaultAccess: 'admin', surface: 'platformManage' },
  { key: 'pages',          href: '/pages',            label: 'Pages',       section: 'Platform', defaultAccess: 'admin', surface: 'platformManage' },
  { key: 'financials',     href: '/coming-soon?feature=financials', label: 'Financial', section: 'Platform', defaultAccess: 'janitor', surface: 'financialDashboard', comingSoon: true },
  { key: 'settings',       href: '/settings',         label: 'Settings',    section: 'Platform', defaultAccess: 'member', surface: 'settings' },
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
