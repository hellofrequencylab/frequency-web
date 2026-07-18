'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Entity-detail tab strip (ADR-233 §3, GitHub Primer UnderlineNav). Horizontal
// underlined tabs to switch between sibling views of ONE entity; each tab is a real
// URL segment (RSC-friendly: each is its own server route). Left-aligned, directly
// above the content it affects.
//
//   <UnderlineTabs tabs={[
//     { href: `/admin/events/${id}`, label: 'Overview' },
//     { href: `/admin/events/${id}/claims`, label: 'Claims', count: 12 },
//     { href: `/admin/events/${id}/attendance`, label: 'Attendance' },
//   ]} />

export function UnderlineTabs({
  tabs,
  activeHref,
}: {
  tabs: { href: string; label: string; count?: number }[]
  /** Override the active tab explicitly (for query-param tabs like `?view=`, where
   *  pathname matching can't tell them apart). Defaults to pathname matching. */
  activeHref?: string
}) {
  const pathname = usePathname()
  return (
    <nav className="admin-subnav-scroll -mb-px flex gap-1 overflow-x-auto border-b border-border" aria-label="Tabs">
      {tabs.map((t) => {
        const active = activeHref !== undefined ? activeHref === t.href : pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              active
                ? 'border-primary-strong text-text'
                : 'border-transparent text-muted hover:border-border-strong hover:text-text'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums ${
                  active ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted'
                }`}
              >
                {t.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
