'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import { groupForPath, dashboardForGroup } from './sections'

// Admin sub-nav (layer 2). The left rail carries the admin suites; here we render
// ONLY the active suite's pages as a short tab strip — so neither menu jams (the
// rail holds suites, this holds ≤7 leaves). The active suite is derived from the
// URL via groupForPath; switching suites happens in the rail. Mirrors the
// marketing workspace sub-nav.
//
// The row carries the wayfinding breadcrumb (Admin › Dashboard › Suite) as a
// prefix — rooted in the suite's operator dashboard (ADR-171) so the three-
// dashboard IA reads in the trail — and the active tab supplies the current page.
export function AdminSubNav({
  role,
  webRole = 'none',
  staffRole = null,
}: {
  role: CommunityRole
  /** STAFF axis (web_role, ADR-208) — gates the admin/janitor-min suites. */
  webRole?: WebRole
  staffRole?: StaffRole | null
}) {
  const pathname = usePathname()
  const group = groupForPath(pathname, role, webRole, staffRole)
  const dashboard = dashboardForGroup(group)

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
      <nav className="scrollbar-none flex items-center gap-1 overflow-x-auto px-4">
        <span className="flex shrink-0 items-center gap-1.5 pr-2 text-sm text-muted">
          <Link href="/admin" className="transition-colors hover:text-text">
            Admin
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span className="text-muted">{dashboard.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          </span>
          <span className="font-medium text-text">{group.label}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        </span>
        {group.links.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-primary-strong'
                  : 'border-transparent text-muted hover:border-border-strong hover:text-text'
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
                strokeWidth={active ? 2.5 : 2}
              />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
