'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import { visibleGroups, domainForPath } from '@/app/(main)/admin/sections'

// The admin LEFT rail — the PRIMARY admin categories (the five-area IA): the four
// operator domains, always listed. Admin Dashboard is the anchor tab in the top bar
// (admin-top-nav.tsx); picking a domain here surfaces its sub-nav up there. Open
// look: no surrounding panel, items sit on the page like the rest of the workspace.
// Role filtering via visibleGroups — a domain shows only when the viewer can use at
// least one of its areas (gating is never reimplemented here).

interface Props {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}

export function AdminLeftNav({ role, webRole = 'none', staffRole = null }: Props) {
  const pathname = usePathname()
  const active = domainForPath(pathname)
  // Only PRIMARY domains list in the left rail. Sub-workspaces folded into a parent
  // (Acquisition / CRM / Marketing → the Growth workspace tabs, ADR-264) are marked
  // primary:false — they keep resolving in the switcher + top sub-nav but don't clutter
  // the rail. The active sub-workspace highlights its parent's tab inside the page.
  const groups = visibleGroups(role, webRole, staffRole).filter((g) => g.primary !== false)

  return (
    <nav aria-label="Admin areas" className="space-y-1">
      <p className="px-3 pb-1 text-3xs font-semibold uppercase tracking-wider text-subtle">Areas</p>
      {groups.map((g) => {
        const isActive = active?.key === g.key
        return (
          <Link
            key={g.key}
            href={g.href}
            title={g.blurb}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-primary-bg font-semibold text-primary-strong'
                : 'font-medium text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <g.Icon
              className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-primary-strong' : 'text-subtle'}`}
              aria-hidden
            />
            {g.label}
          </Link>
        )
      })}
    </nav>
  )
}
