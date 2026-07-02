'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The two sections of the Page layout manager, rendered as tabs by the shared layout so both the
// Chrome (right-rail) manager and the Apps (per-scope override) manager sit under one surface
// (/admin/page-layout). Client island: it highlights the active tab from the pathname. DAWN tokens
// only; voice canon (no em dashes).

const TABS: readonly { href: string; label: string }[] = [
  { href: '/admin/page-layout', label: 'Chrome' },
  { href: '/admin/page-layout/apps', label: 'Apps' },
]

export function PageLayoutTabs() {
  const pathname = usePathname()
  return (
    <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Page layout sections">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              active
                ? 'border-primary-strong text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
