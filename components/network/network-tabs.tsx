'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Globe, Contact } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// The Network hub tab strip (ADR-172). Two member-facing surfaces under one hub:
// Community (the member directory) and My Contacts (the personal contact book).
// A tab is active on its exact path or any sub-path (so a contact detail still
// highlights My Contacts).
const TABS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/network', label: 'Community', Icon: Globe },
  { href: '/network/contacts', label: 'My Contacts', Icon: Contact },
]

export function NetworkTabs() {
  const pathname = usePathname()
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur-sm">
      <nav className="scrollbar-none mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4">
        {TABS.map(({ href, label, Icon }) => {
          // '/network' is active only on itself (not on '/network/contacts');
          // deeper tabs match their sub-paths too.
          const active =
            href === '/network'
              ? pathname === '/network'
              : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-primary-strong'
                  : 'border-transparent text-muted hover:border-border-strong hover:text-text'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
