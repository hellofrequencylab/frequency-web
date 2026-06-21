'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MegaMenu, navTriggerClass } from '@/components/layout/mega-menu'
import type { AdminNavSection } from '@/lib/admin/nav'

// The admin top navigation as a best-practice mega menu: each operator SECTION is a trigger
// that navigates to its root on click AND reveals its sub-pages on hover / keyboard focus.
// Sections with no sub-pages (Dashboard, Leadership) render as plain tabs. Gated server-side
// and passed in; this only renders + tracks the active section. NB: `flex-wrap` (not an
// overflow scroller) so the absolute panels are never clipped.

function isActive(pathname: string, href: string) {
  return href === '/admin'
    ? pathname === '/admin'
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminMegaNav({ sections }: { sections: AdminNavSection[] }) {
  const pathname = usePathname()
  if (sections.length === 0) return null

  return (
    <nav aria-label="Admin" className="flex flex-wrap items-center gap-0.5">
      {sections.map((s) =>
        s.groups && s.groups.length > 0 ? (
          <MegaMenu key={s.href} label={s.label} href={s.href} sections={s.groups} variant="light" />
        ) : (
          <Link
            key={s.href}
            href={s.href}
            aria-current={isActive(pathname, s.href) ? 'page' : undefined}
            className={navTriggerClass('light', isActive(pathname, s.href))}
          >
            {s.label}
          </Link>
        ),
      )}
    </nav>
  )
}
