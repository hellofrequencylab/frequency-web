'use client'

import Link from 'next/link'
import { Bug } from 'lucide-react'
import { BrandMark } from '@/components/layout/brand-mark'
import { meetsAccess, meetsStaff, NAV_AREA_DEFAULTS, type NavAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole, StaffDomain } from '@/lib/staff'
import type { AccessLevel } from '@/lib/core/access-matrix'
import { SITE_TAGLINE, ORG_LEGAL_NAME } from '@/lib/site'

// The MEMBER sitemap footer — a rich, multi-column lower footer (Strava/Discord/
// LinkedIn register) that renders on the CANVAS at the END of the center content
// column on member pages and scrolls up with the page (normal flow, never fixed).
// It is a SEPARATE system from the admin footer (components/admin/admin-footer.tsx):
// the admin one navigates the operator workspace; this one is the member's map of
// the community + the wider site.
//
// ROLE-AWARE: every link is gated with the SAME logic the left rail uses
// (lib/nav-areas.ts). For a link that maps to a NAV_AREA key, the server-resolved
// `navAccess` matrix is authoritative (it already folds in role/tier/staff, and the
// view-as preview); links without a nav key fall back to the role/staff ladder. A
// surface the viewer resolves to 'none' on is dropped, and a column left empty is
// dropped whole. So a logged-out visitor never sees a member-only destination, and
// the footer never links anyone to a surface they can't use.

// A footer link. `navKey` ties it to a NAV_AREA (so it shares the rail's gating);
// `access`/`staffDomain` gate the extras that have no nav key (e.g. People, Support).
type FootLink = {
  href: string
  label: string
  /** NAV_AREA key — gating reuses the rail's matrix/ladder for this surface. */
  navKey?: string
  /** Ladder gate for a link with no nav key. Defaults to 'visitor' (everyone). */
  access?: NavAccess
  /** Staff capability that also unlocks the link (unioned with the ladder). */
  staffDomain?: StaffDomain
  /** Fire the shared support sheet instead of navigating (Report a bug). */
  onClickEvent?: { name: string; detail?: unknown }
}

type FootColumn = { title: string; links: FootLink[] }

// The columns. Order here IS the render order. Public/company columns sit to the
// right of the in-app ones. A link's reachability is decided at render (below);
// authoring stays declarative.
const COLUMNS: FootColumn[] = [
  {
    title: 'Explore',
    links: [
      { href: '/feed', label: 'Feed', navKey: 'feed' },
      { href: '/circles', label: 'Circles', navKey: 'circles' },
      { href: '/channels', label: 'Channels', navKey: 'channels' },
      { href: '/events', label: 'Events', navKey: 'events' },
      { href: '/market', label: 'Marketplace', navKey: 'market' },
      { href: '/marketplace/housing', label: 'Housing', navKey: 'housing' },
      { href: '/marketplace/makers', label: 'Makers', navKey: 'maker' },
      { href: '/shop', label: 'Shop', navKey: 'shop' },
      { href: '/network', label: 'Community', navKey: 'people' },
    ],
  },
  {
    title: 'The Quest',
    links: [
      { href: '/crew', label: 'Dashboard', navKey: 'quest' },
      { href: '/journeys', label: 'Journeys', navKey: 'journeys' },
      { href: '/practices', label: 'Practices', navKey: 'practices' },
      { href: '/library', label: 'Library', navKey: 'library' },
      { href: '/crew/leaderboard', label: 'Leaderboard', access: 'member' },
      { href: '/crew/store', label: 'The Vault', navKey: 'vault' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { href: '/people', label: 'People', access: 'member' },
      { href: '/partners', label: 'Partners', access: 'member' },
      { href: '/messages', label: 'Message Boards', navKey: 'messageBoards' },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/help', label: 'Help' },
      {
        href: '/help',
        label: 'Report a bug',
        onClickEvent: { name: 'open-support', detail: { type: 'bug' } },
      },
      { href: '/support', label: 'Support', access: 'member' },
    ],
  },
  {
    title: 'Frequency',
    links: [
      { href: '/about', label: 'About' },
      { href: '/the-lab', label: 'The Lab' },
      { href: '/the-community', label: 'The Community' },
      { href: '/the-quest', label: 'The Quest' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
]

export interface MemberFooterProps {
  /** Viewer's gating role (null = visitor / view-as-visitor preview). */
  role: CommunityRole | null
  /** Viewer's staff role (team_members axis); unions with the ladder. */
  staffRole?: StaffRole | null
  /** Server-resolved access matrix per NAV_AREA key — authoritative when present. */
  navAccess?: Record<string, AccessLevel>
}

// Can the viewer reach a link? For a nav-keyed link, defer to the rail's logic:
// the matrix wins when present, else the default-access ladder unioned with staff.
// For a keyless link, gate on its own `access` ladder unioned with staff.
function reachable(
  link: FootLink,
  role: CommunityRole | null,
  staffRole: StaffRole | null,
  navAccess: Record<string, AccessLevel> | undefined,
): boolean {
  if (link.navKey) {
    if (navAccess && link.navKey in navAccess) return navAccess[link.navKey] !== 'none'
    const access = NAV_AREA_DEFAULTS[link.navKey] ?? 'visitor'
    return meetsAccess(access, role) || meetsStaff(link, staffRole)
  }
  return meetsAccess(link.access ?? 'visitor', role) || meetsStaff(link, staffRole)
}

export function MemberFooter({ role, staffRole = null, navAccess }: MemberFooterProps) {
  const columns = COLUMNS.map((col) => ({
    ...col,
    links: col.links.filter((l) => reachable(l, role, staffRole, navAccess)),
  })).filter((col) => col.links.length > 0)

  // Stable across the SSR → hydrate boundary (the year doesn't change mid-render),
  // so there's no hydration drift.
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-border pt-10 pb-6" aria-label="Site footer">
      <nav
        aria-label="Footer"
        className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6"
      >
        {columns.map((col) => (
          <div key={col.title}>
            <p className="mb-3 text-3xs font-semibold uppercase tracking-wider text-subtle">
              {col.title}
            </p>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={`${col.title}-${link.label}-${link.href}`}>
                  {link.onClickEvent ? (
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent(link.onClickEvent!.name, {
                            detail: link.onClickEvent!.detail,
                          }),
                        )
                      }
                      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
                    >
                      <Bug className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                      {link.label}
                    </button>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-text"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom bar — brandmark + tagline, then the copyright line. */}
      <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="-ml-3.5 shrink-0">
            <BrandMark />
          </span>
          <p className="text-sm text-muted">{SITE_TAGLINE}.</p>
        </div>
        <p className="text-2xs text-subtle">
          &copy; {year} {ORG_LEGAL_NAME}
        </p>
      </div>
    </footer>
  )
}
