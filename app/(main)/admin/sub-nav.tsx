'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CommunityRole } from '@/lib/core/roles'
import { visibleGroups } from './sections'

// Admin top nav. Renders the grouped catalog from sections.ts (one source of
// truth, shared with the Overview launchpad) so every surface is reachable and
// nothing is orphaned. Groups telescope by role via visibleGroups(): a host sees
// Community; a guide adds Structure; a janitor adds Insights, Vera, Platform.
// Faint group separators keep the horizontal bar legible without a wall of tabs.

export function AdminSubNav({ role }: { role: CommunityRole }) {
  const pathname = usePathname()
  const groups = visibleGroups(role)

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
      <nav className="scrollbar-none flex items-stretch overflow-x-auto px-4">
        {groups.map((group, gi) => (
          <div key={group.key} className="flex items-stretch">
            {gi > 0 && <span className="my-2 w-px shrink-0 self-center bg-border" aria-hidden />}
            <span className="flex shrink-0 items-center pl-3 pr-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle/70">
              {group.label}
            </span>
            {group.links.map(({ href, label, Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href)
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
          </div>
        ))}
      </nav>
    </div>
  )
}
