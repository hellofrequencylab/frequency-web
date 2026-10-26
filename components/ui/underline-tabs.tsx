'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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
//
// A row with a long tail can fold the rare views behind ONE disclosure so the strip stays
// short; every href inside it is still a real link in the markup, so the views remain
// crawlable and middle-clickable:
//
//   { label: 'Other', menu: [{ href: '/housing?type=condo', label: 'Condo' }, …] }

export type UnderlineTabLink = { href: string; label: string; count?: number }
export type UnderlineTabMenu = { label: string; menu: UnderlineTabLink[] }
export type UnderlineTabItem = UnderlineTabLink | UnderlineTabMenu

// The members kit's `.tabs` strip (ADR-1737): a hairline, 44px tabs, the active one ink with
// a 1.5px underline. Count pills and the dropdown panel are `mu-count` / `mu-menu`
// (app/themes/frequency/members-ui.css).

export function UnderlineTabs({
  tabs,
  activeHref,
  label = 'Tabs',
}: {
  tabs: UnderlineTabItem[]
  /** Override the active tab explicitly (for query-param tabs like `?view=`, where
   *  pathname matching can't tell them apart). Defaults to pathname matching. */
  activeHref?: string
  /** Accessible name for the strip ("Housing categories", "Page layout sections"). Defaults
   *  to "Tabs"; pass a specific one whenever a page carries more than one nav landmark. */
  label?: string
}) {
  const pathname = usePathname()
  const isActive = (href: string) => (activeHref !== undefined ? activeHref === href : pathname === href)
  return (
    <nav className={cn('tabs', tabs.some((t) => 'menu' in t) && 'mu-wrap')} aria-label={label}>
      {tabs.map((t) =>
        'menu' in t ? (
          <details key={`menu:${t.label}`} data-popover className="group relative shrink-0">
            <summary className={t.menu.some((m) => isActive(m.href)) ? 'on' : undefined}>
              {t.label}
              <ChevronDown className="transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mu-menu">
              {t.menu.map((m) => (
                <Link key={m.href} href={m.href} aria-current={isActive(m.href) ? 'page' : undefined}>
                  {m.label}
                </Link>
              ))}
            </div>
          </details>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive(t.href) ? 'page' : undefined}
            className={isActive(t.href) ? 'on' : undefined}
          >
            {t.label}
            {t.count !== undefined && <span className="mu-count">{t.count}</span>}
          </Link>
        ),
      )}
    </nav>
  )
}
