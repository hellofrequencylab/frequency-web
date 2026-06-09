'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Globe, Contact } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Inline variant of the Network hub tab strip, for the Community page where the
// tabs sit *under* the page header on the page background — no white/elevated
// surface, no sticky bar. Same two destinations and active rules as
// <NetworkTabs>; only the chrome differs (transparent, inline).
const TABS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/network', label: 'Community', Icon: Globe },
  { href: '/network/contacts', label: 'My Contacts', Icon: Contact },
]

export function CommunityTabs() {
  const pathname = usePathname()
  return (
    <nav className="-mb-px flex items-center gap-1" aria-label="Network">
      {TABS.map(({ href, label, Icon }) => {
        const active =
          href === '/network'
            ? pathname === '/network'
            : pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition-colors ${
              active
                ? 'border-primary text-primary-strong'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
              strokeWidth={active ? 2.5 : 2}
            />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
