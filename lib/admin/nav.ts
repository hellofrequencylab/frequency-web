// Single source of truth for the ADMIN top navigation: the operator sections and the
// sub-pages each one fans out into. The admin layout filters this to the sections a viewer
// can reach, then renders them as a best-practice mega menu (each section trigger navigates
// to its root AND reveals its sub-pages on hover / keyboard focus). Framework-independent
// (no React) so the server layout and the client menu share it.
//
// Gating mirrors the prior flat admin menu: a section shows when the viewer meets its role
// floor OR holds its staff domain. Sub-pages inherit the section's gate (they each re-gate
// server-side anyway), so the mega panel never needs its own per-page gate.

import { atLeastRole, isStaff, isJanitor, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { staffCan, type StaffRole, type StaffDomain } from '@/lib/core/staff-roles'

export type AdminNavLink = { label: string; href: string }
export type AdminNavGroup = { heading?: string; items: AdminNavLink[] }

export type AdminNavSection = {
  href: string
  label: string
  /** Community-ladder floor: 'janitor' / 'admin' read the staff web_role; others read the
   *  trust ladder. */
  min: CommunityRole
  /** Optional staff capability that also unlocks the section (unioned with `min`). */
  staffDomain?: StaffDomain
  /** The sub-pages this section fans out into. Omitted for a section that is just a direct
   *  link (Dashboard, Leadership) — it renders as a plain tab, no panel. */
  groups?: AdminNavGroup[]
}

// Order IS the render order across the admin bar. Mirrors the left-rail Admin section; each
// section's groups are the real `/admin/*` pages it owns (verified against the route tree).
export const ADMIN_NAV: readonly AdminNavSection[] = [
  { href: '/admin', label: 'Dashboard', min: 'admin' },
  {
    href: '/admin/community',
    label: 'Community',
    min: 'host',
    staffDomain: 'community',
    groups: [
      {
        heading: 'Spaces & groups',
        items: [
          { label: 'Circles', href: '/admin/circles' },
          { label: 'Circle Templates', href: '/admin/circle-templates' },
          { label: 'Channels', href: '/admin/channels' },
          { label: 'Hubs', href: '/admin/hubs' },
          { label: 'Nexuses', href: '/admin/nexuses' },
        ],
      },
      {
        heading: 'People',
        items: [
          { label: 'Member Roster', href: '/admin/members' },
          { label: 'Connection Settings', href: '/admin/connections' },
          { label: 'Personas', href: '/admin/personas' },
          { label: 'Segments', href: '/admin/segments' },
        ],
      },
      {
        heading: 'Activity',
        items: [
          { label: 'Events', href: '/admin/events' },
          { label: 'Import from chat', href: '/admin/import' },
          { label: 'Dispatches', href: '/admin/dispatches' },
          { label: 'Moderation', href: '/admin/moderation' },
        ],
      },
    ],
  },
  { href: '/lead', label: 'Leadership', min: 'host' },
  {
    href: '/admin/programs',
    label: 'Programs',
    min: 'host',
    staffDomain: 'community',
    groups: [
      {
        heading: 'Content',
        items: [
          { label: 'Practices', href: '/admin/content/practices' },
          { label: 'Library health', href: '/admin/content/practices/health' },
          { label: 'Journeys', href: '/admin/content/journeys' },
          { label: 'Challenges', href: '/admin/content/challenges' },
          { label: 'Seasons', href: '/admin/content/seasons' },
          { label: 'Tips', href: '/admin/content/tips' },
          { label: 'Training', href: '/admin/content/training' },
        ],
      },
      {
        heading: 'Engagement',
        items: [
          { label: 'Crew tasks', href: '/admin/crew-tasks' },
          { label: 'Gamification', href: '/admin/gamification' },
          { label: 'Store', href: '/admin/store' },
        ],
      },
    ],
  },
  {
    href: '/admin/growth',
    label: 'Growth',
    min: 'host',
    staffDomain: 'marketing',
    groups: [
      {
        heading: 'Acquisition',
        items: [
          { label: 'Applications', href: '/admin/growth/applications' },
          { label: 'Referrals', href: '/admin/referrals' },
        ],
      },
      {
        heading: 'Marketing',
        items: [
          { label: 'Campaigns', href: '/admin/marketing/campaigns' },
          { label: 'Funnels', href: '/admin/marketing/funnels' },
          { label: 'Automations', href: '/admin/marketing/automations' },
          { label: 'Nurture', href: '/admin/marketing/nurture' },
          { label: 'Analytics', href: '/admin/marketing/analytics' },
          { label: 'Beta', href: '/admin/marketing/beta' },
        ],
      },
    ],
  },
  {
    // Resonance CRM (ADR-382 to 387): the Vera-driven, prediction-powered CRM. The section root is
    // the platform cockpit; the sub-pages are the loop (Today), the member drill-down, and the records.
    // Gated 'janitor' to match the pages, which gate on requireAdmin('janitor') because the per-member
    // predictions are sensitive (the cockpit / Today / Members all read member_traits + scores).
    href: '/admin/crm',
    label: 'Resonance CRM',
    min: 'janitor',
    groups: [
      {
        heading: 'Engine',
        items: [
          { label: 'Cockpit', href: '/admin/crm' },
          { label: 'Today', href: '/admin/crm/today' },
          { label: 'Member Intelligence', href: '/admin/crm/members' },
          { label: 'Playbooks', href: '/admin/crm/playbooks' },
          { label: 'Resonance Graph', href: '/admin/crm/graph' },
        ],
      },
      {
        heading: 'Records',
        items: [
          { label: 'Contacts', href: '/admin/crm/contacts' },
          { label: 'Deals', href: '/admin/crm/deals' },
          { label: 'All Contacts', href: '/admin/marketing/contacts' },
        ],
      },
    ],
  },
  {
    href: '/admin/vera-ai',
    label: 'Vera AI',
    min: 'janitor',
    staffDomain: 'insights',
    groups: [
      {
        items: [
          { label: 'Insights', href: '/admin/insights' },
          { label: 'Market read', href: '/admin/marketing/market-read' },
          { label: 'Marketing agent', href: '/admin/marketing/agent' },
        ],
      },
    ],
  },
  {
    href: '/admin/operations',
    label: 'Operations',
    min: 'janitor',
    staffDomain: 'platform',
    groups: [
      {
        heading: 'Platform',
        items: [
          { label: 'Audit', href: '/admin/audit' },
          { label: 'Payments', href: '/admin/payments' },
          { label: 'Pricing', href: '/admin/pricing' },
          { label: 'Roles', href: '/admin/roles' },
          { label: 'Support', href: '/admin/support' },
        ],
      },
      {
        heading: 'Configuration',
        items: [
          { label: 'Onboarding', href: '/admin/onboarding-controls' },
          { label: 'Walkthroughs', href: '/admin/walkthroughs' },
          { label: 'Page layout', href: '/admin/page-layout' },
          { label: 'Menu', href: '/admin/menu' },
          { label: 'Appearance', href: '/admin/appearance' },
          { label: 'Demo', href: '/admin/demo' },
        ],
      },
    ],
  },
  {
    href: '/admin/marketplace',
    label: 'Marketplace',
    min: 'admin',
    staffDomain: 'platform',
    groups: [
      {
        heading: 'Catalog',
        items: [
          { label: 'Shop catalog', href: '/admin/marketplace' },
        ],
      },
      {
        heading: 'Activity',
        items: [
          { label: 'Orders', href: '/admin/marketplace/orders' },
          { label: 'Reports', href: '/admin/marketplace/reports' },
        ],
      },
    ],
  },
  {
    href: '/admin/qr',
    label: 'QR Studio',
    min: 'admin',
    staffDomain: 'qr',
    groups: [
      {
        items: [
          { label: 'QR codes', href: '/admin/qr' },
          { label: 'Scan stats', href: '/admin/qr/stats' },
          { label: 'Spaces', href: '/admin/spaces' },
        ],
      },
    ],
  },
]

/** Whether a viewer can see an admin section: the role floor (web_role for admin/janitor,
 *  else the trust ladder) OR the staff domain. Mirrors the prior flat-menu gate exactly. */
export function canSeeAdminSection(
  section: AdminNavSection,
  role: CommunityRole,
  webRole: WebRole,
  staffRole: StaffRole | null,
): boolean {
  const meetsMin =
    section.min === 'janitor'
      ? isJanitor(webRole)
      : section.min === 'admin'
        ? isStaff(webRole)
        : atLeastRole(role, section.min)
  return meetsMin || (!!section.staffDomain && staffCan(staffRole, section.staffDomain, 'write'))
}
