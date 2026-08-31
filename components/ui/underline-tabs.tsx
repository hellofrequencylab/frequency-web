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

const TAB =
  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-body-sm font-semibold transition-colors'
const ACTIVE = 'border-primary-strong text-text'
const IDLE = 'border-transparent text-muted hover:border-border-strong hover:text-text'

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
    <nav
      // A disclosure and a horizontal scroller cannot share a box. `overflow-x: auto` forces
      // `overflow-y` to compute to `auto` as well (CSS Overflow §3 — only `visible` pairs with
      // `visible`), so the ~44px-tall strip clips its own absolutely-positioned menu, and
      // `.admin-subnav-scroll`'s mask-image clips descendant painting on top of that. The menu
      // gets sliced off with no scrollbar to hint at it, because that class hides those too.
      //
      // So the strip stops scrolling when it carries a menu, and wraps instead. That is not a
      // trade, it is the same intent: `menu` exists so a long tail folds away and the strip
      // stays SHORT. A strip short enough to want a disclosure is short enough not to need a
      // scroller. Whole class strings either side, because Tailwind scans source text.
      className={
        tabs.some((t) => 'menu' in t)
          ? '-mb-px flex flex-wrap gap-1 border-b border-border'
          : 'admin-subnav-scroll -mb-px flex gap-1 overflow-x-auto border-b border-border'
      }
      aria-label={label}
    >
      {tabs.map((t) =>
        'menu' in t ? (
          // Long-tail group. A native <details> so it needs no client JS, and its links are in the
          // DOM whether it is open or shut.
          <details key={`menu:${t.label}`} className="group relative shrink-0">
            <summary
              className={cn(
                TAB,
                'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
                t.menu.some((m) => isActive(m.href)) ? ACTIVE : IDLE,
              )}
            >
              {t.label}
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="absolute left-0 z-20 mt-1 min-w-[9rem] rounded-card border border-border bg-surface p-1 lift-3">
              {t.menu.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  aria-current={isActive(m.href) ? 'page' : undefined}
                  className={cn(
                    'block rounded-control-nested px-3 py-1.5 text-body-sm transition-colors',
                    isActive(m.href)
                      ? 'bg-primary-bg font-semibold text-primary-strong'
                      : 'text-muted hover:bg-surface-elevated hover:text-text',
                  )}
                >
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
            className={cn(TAB, isActive(t.href) ? ACTIVE : IDLE)}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'rounded-pill px-1.5 py-0.5 text-2xs font-bold tabular-nums',
                  isActive(t.href) ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted',
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        ),
      )}
    </nav>
  )
}
