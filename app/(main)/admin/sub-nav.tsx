'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import { adminDestinations, canSeeGroup, domainForPath, pageLabelForPath, ADMIN_GROUPS } from './sections'

// Admin top bar (layer 2). The KEY fix (Phase 1): this strip no longer reshuffles
// its items per page. It is a STABLE switcher of the four destinations — Home /
// Programs / Operations / Growth — with the active one derived from the URL via
// `domainForPath` (Home is active only on /admin exactly). Switching domains lands
// you on that domain's dashboard; the dashboard's own area cards take you to the
// feature pages. Below the switcher sits the wayfinding breadcrumb
// `Admin › {Domain} › {Page}`.
export function AdminSubNav({
  role,
  webRole = 'none',
  staffRole = null,
}: {
  role: CommunityRole
  /** STAFF axis (web_role, ADR-208) — gates the admin/janitor-min destinations. */
  webRole?: WebRole
  staffRole?: StaffRole | null
}) {
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)
  const pageLabel = pageLabelForPath(pathname)

  // Only show destinations the viewer can enter. Home is always present (the floor);
  // a domain shows if the viewer clears its floor or any link under it.
  const destinations = adminDestinations().filter((d) => {
    if (d.key === 'home') return true
    const group = ADMIN_GROUPS.find((g) => g.key === d.key)
    return group ? canSeeGroup(group, role, webRole, staffRole) : false
  })

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
      <nav className="scrollbar-none flex items-center gap-1 overflow-x-auto px-4">
        {destinations.map(({ key, label, href, Icon, exact }) => {
          const active =
            key === 'home'
              ? pathname === '/admin'
              : activeDomain?.key === key || (exact ? pathname === href : pathname.startsWith(href))
          return (
            <Link
              key={key}
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

      {/* Wayfinding breadcrumb: Admin › Domain › Page. */}
      <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto border-t border-border/60 px-4 py-2 text-sm text-muted">
        <Link href="/admin" className="shrink-0 transition-colors hover:text-text">
          Admin
        </Link>
        {activeDomain && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
            <Link
              href={activeDomain.href}
              className={`shrink-0 transition-colors hover:text-text ${pageLabel ? '' : 'font-medium text-text'}`}
            >
              {activeDomain.label}
            </Link>
          </>
        )}
        {pageLabel && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
            <span className="shrink-0 font-medium text-text">{pageLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}
