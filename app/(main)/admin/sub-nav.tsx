'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { CommunityRole } from '@/lib/core/roles'
import { groupForPath } from './sections'

// Admin sub-nav (layer 2). The left rail carries the five admin categories; here
// we render ONLY the active category's pages as a short tab strip — so neither
// menu jams (the rail holds categories, this holds ≤7 leaves). The active
// category is derived from the URL via groupForPath; switching categories happens
// in the rail. Mirrors the marketing workspace sub-nav.
//
// The row also carries the wayfinding breadcrumb (Admin › Group) as a prefix, so
// there's no separate stacked breadcrumb above it (it's suppressed site-side on
// /admin) — the active tab supplies the current page, completing the trail.
export function AdminSubNav({ role }: { role: CommunityRole }) {
  const pathname = usePathname()
  const group = groupForPath(pathname, role)

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
      <nav className="scrollbar-none flex items-center gap-1 overflow-x-auto px-4">
        <span className="flex shrink-0 items-center gap-1.5 pr-2 text-sm text-muted">
          <Link href="/admin" className="transition-colors hover:text-text">
            Admin
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
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
