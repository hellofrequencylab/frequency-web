'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The kit's underline `.tabs`, over ROUTES. A layout renders once for its whole tab group, so the
// active tab is read from the pathname on the client (the same reason components/ui/underline-tabs
// is a client leaf). Real links with aria-current, never ARIA tab roles: these are pages.
export function FqRouteTabs({
  tabs,
  label,
  className,
}: {
  tabs: readonly { href: string; label: string; count?: number }[]
  label: string
  className?: string
}) {
  const pathname = usePathname()
  // The longest matching href wins, so the base tab (a prefix of every other) is active only on itself.
  const active = [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href
  return (
    <nav className={className ? `tabs ${className}` : 'tabs'} aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? 'on' : undefined} aria-current={t.href === active ? 'page' : undefined}>
          {t.label}
          {t.count != null ? ` ${t.count}` : ''}
        </Link>
      ))}
    </nav>
  )
}
