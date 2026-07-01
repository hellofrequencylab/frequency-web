'use client'

import Link from 'next/link'
import { Bug } from 'lucide-react'
import { BrandMark } from '@/components/layout/brand-mark'
import { meetsAccess, meetsStaff, NAV_AREA_DEFAULTS, type NavAccess } from '@/lib/nav-areas'
import { footerColumns } from '@/lib/nav/registry'
import type { NavNode } from '@/lib/nav/types'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import type { AccessLevel } from '@/lib/core/access-matrix'
import { SITE_TAGLINE, ORG_LEGAL_NAME } from '@/lib/site'

// The MEMBER sitemap footer — a rich, multi-column lower footer (Strava/Discord/
// LinkedIn register) that renders on the CANVAS at the END of the center content
// column on member pages and scrolls up with the page (normal flow, never fixed).
// It is a SEPARATE system from the admin footer (components/admin/admin-footer.tsx):
// the admin one navigates the operator workspace; this one is the member's map of
// the community + the wider site.
//
// ONE SOURCE: the columns + links come from the unified nav registry (lib/nav), the
// column-grouped `surface:'footer'` nodes (footerColumns()), so the member sitemap and
// the rail can never drift. The bug-report row is render-time chrome (an event button,
// not a navigable destination), injected into the Support column below.
//
// ROLE-AWARE: every link is gated with the SAME logic the left rail uses
// (lib/nav-areas.ts). For a link that mirrors a NAV_AREA (`node.navKey`), the
// server-resolved `navAccess` matrix is authoritative (it already folds in role/tier/
// staff, and the view-as preview); links without a nav key fall back to the role/staff
// ladder (== the registry canSee union). A surface the viewer resolves to 'none' on is
// dropped, and a column left empty is dropped whole. So a logged-out visitor never sees a
// member-only destination, and the footer never links anyone to a surface they can't use.

// The Support column injects a "Report a bug" event button (fires the shared support
// sheet) directly after its Help link — chrome, not a registry destination.
const BUG_REPORT = {
  label: 'Report a bug',
  event: { name: 'open-support', detail: { type: 'bug' } as unknown },
  afterHref: '/help',
} as const

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
// For a keyless link, gate on its own `gate` (minAccess ladder unioned with staff).
// This mirrors the registry canSee union exactly, plus the matrix short-circuit the
// rail uses, so the member footer stays byte-identical to its previous output.
function reachable(
  node: NavNode,
  role: CommunityRole | null,
  staffRole: StaffRole | null,
  navAccess: Record<string, AccessLevel> | undefined,
): boolean {
  if (node.navKey) {
    if (navAccess && node.navKey in navAccess) return navAccess[node.navKey] !== 'none'
    const access = NAV_AREA_DEFAULTS[node.navKey] ?? 'visitor'
    return (
      meetsAccess(access, role) ||
      meetsStaff({ staffDomain: node.gate.staffDomain }, staffRole)
    )
  }
  return (
    meetsAccess((node.gate.minAccess as NavAccess) ?? 'visitor', role) ||
    meetsStaff({ staffDomain: node.gate.staffDomain }, staffRole)
  )
}

export function MemberFooter({ role, staffRole = null, navAccess }: MemberFooterProps) {
  const columns = footerColumns()
    .map((col) => ({
      ...col,
      links: col.links.filter((l) => reachable(l, role, staffRole, navAccess)),
    }))
    .filter((col) => col.links.length > 0)

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
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-text"
                  >
                    {link.label}
                  </Link>
                  {/* Report-a-bug chrome: injected directly after the Help link, so the
                      Support column reads Help · Report a bug · Support as before. */}
                  {link.href === BUG_REPORT.afterHref && (
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent(BUG_REPORT.event.name, {
                            detail: BUG_REPORT.event.detail,
                          }),
                        )
                      }
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
                    >
                      <Bug className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                      {BUG_REPORT.label}
                    </button>
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
