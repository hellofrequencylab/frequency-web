'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'

// THE CIRCLE'S SECTION TABS, MADE PROMINENT (templates/circles/Circles.dc.html): a sticky glass pill
// over the real tab ROUTES (a layout renders once for its group, so the active tab is read from the
// pathname). Real links with aria-current, never ARIA tab roles: these are pages. Choosing a tab
// while scrolled past the bar glides back to the bar, so the next tab starts at its top.

const ICON: Record<string, FqIconName> = {
  '': 'message',
  'whats-on': 'event',
  members: 'contacts',
  stats: 'chart',
}

/** Where the bar sticks below the page top; the glide stops this far above the bar. */
const STICKY_OFFSET = 96

export function FqCircleTabs({
  tabs,
  label,
  baseHref,
}: {
  tabs: readonly { href: string; label: string; count?: number }[]
  label: string
  baseHref: string
}) {
  const pathname = usePathname()
  const bar = useRef<HTMLElement>(null)
  const active = [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href

  function glide() {
    const el = bar.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET
    if (window.scrollY <= top + 2) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top, behavior: calm ? 'auto' : 'smooth' })
  }

  return (
    <nav ref={bar} className="fqc-tabs" aria-label={label}>
      {tabs.map((t) => {
        const on = t.href === active
        const key = t.href === baseHref ? '' : t.href.slice(baseHref.length + 1)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={on ? 'fqc-tab on' : 'fqc-tab'}
            aria-current={on ? 'page' : undefined}
            onClick={glide}
          >
            <FqIcon name={ICON[key] ?? 'circle'} />
            <span>{t.label}</span>
            {t.count != null && <span className="fqc-tab-n">{t.count}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
