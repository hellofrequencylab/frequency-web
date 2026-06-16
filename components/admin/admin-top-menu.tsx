'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The simple admin menu: a horizontal row of the admin sections, sitting above the
// search bar at the top of every admin page and staying put on scroll (the layout
// wraps it + the search bar in one sticky band). Items are gated server-side and
// passed in; this only renders + tracks the active one. Dashboard (/admin) matches
// exactly; every other item matches its path prefix.
export function AdminTopMenu({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname()
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Admin"
      className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => {
        const active =
          it.href === '/admin'
            ? pathname === '/admin'
            : pathname === it.href || pathname.startsWith(`${it.href}/`)
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none ${
              active
                ? 'bg-primary-bg font-semibold text-primary-strong'
                : 'font-medium text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}
