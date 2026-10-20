'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import type { MegaColumn, MegaCta } from './mega-footer'

// THE FOOTER'S TAB BAR (LIVE-1115). The member header's mega menu turned upside down: a row of tabs, one
// per area of the site index, pinned to the bottom of the window between the two rail docks. A tab opens
// its area's panel UP out of the bar, the way a header tab drops its panel down. Same pieces as the header
// (components/frequency/members/shell/header.tsx): the nav pill and its pastel "on" state, and the
// .ap-mega columns, foot line and call to action inside the panel.
//
// Every panel is in the HTML with the bar closed (`hidden`), so a crawler reads the whole index. A tab is a
// disclosure button: Escape or a click outside closes it and hands focus back, ArrowLeft and ArrowRight move
// along the bar, a link inside closes it, and a navigation closes it.

const ICONS: Record<string, FqIconName> = {
  Explore: 'compass',
  'The Quest': 'trophy',
  Connect: 'crew',
  Support: 'help',
  Frequency: 'globe',
  Legal: 'shield',
}

/** Each destination's own glyph, as the header's menu rows carry one; a page not listed takes its area's. */
const LINK_ICONS: Record<string, FqIconName> = {
  '/feed': 'home',
  '/circles': 'circle',
  '/channels': 'message',
  '/events': 'event',
  '/nearby': 'pin',
  '/spaces/directory': 'space',
  '/classifieds': 'tag',
  '/market': 'tag',
  '/store': 'wallet',
  '/network': 'crew',
  '/crew': 'streak',
  '/journeys': 'goal',
  '/practices': 'practice',
  '/crew/leaderboard': 'podium',
  '/crew/store': 'vault',
  '/people': 'user',
  '/partners': 'host',
  '/messages': 'message',
  '/help': 'help',
  '/support': 'message',
  '/about': 'globe',
  '/the-community': 'crew',
  '/vision': 'lesson',
  '/features#f-zaps': 'zap',
  '/help/the-quest': 'zap',
  '/pricing': 'wallet',
  '/vs': 'chart',
  '/privacy': 'shield',
  '/terms': 'page',
  '/guidelines': 'flag',
  '/space-email-policy': 'message',
  '/help#accessibility': 'help',
}

const panelId = (i: number) => `fq-mf-p${i}`

export function MegaFooterTabs({
  columns,
  ctas,
  tagline,
  copyright,
  contact,
}: {
  columns: readonly MegaColumn[]
  ctas: readonly MegaCta[]
  tagline: string
  copyright: string
  contact: string
}) {
  const [open, setOpen] = useState<{ i: number; path: string } | null>(null)
  const pathname = usePathname()
  const bar = useRef<HTMLDivElement>(null)
  // A panel belongs to the page it opened on, so a navigation closes it without an effect.
  const on = open && open.path === pathname ? open.i : null
  const close = useCallback((refocus: boolean) => {
    setOpen((o) => {
      if (o && refocus) bar.current?.querySelector<HTMLElement>(`[aria-controls="${panelId(o.i)}"]`)?.focus()
      return null
    })
  }, [])

  useEffect(() => {
    if (on === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
    }
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [on, close])

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + columns.length) % columns.length
    bar.current?.querySelector<HTMLElement>(`[aria-controls="${panelId(next)}"]`)?.focus()
    if (on !== null) setOpen({ i: next, path: pathname })
  }

  return (
    <div className="fq-mf-dock" ref={bar} data-open={on !== null ? '' : undefined}>
      {columns.map((col, i) => (
        <div
          key={col.title}
          id={panelId(i)}
          className={on === i ? 'fq-mf-mega on' : 'fq-mf-mega'}
          role="region"
          aria-label={col.title}
          hidden={on !== i}
          onClick={(e) => {
            if ((e.target as Element).closest('a')) close(false)
          }}
        >
          <div className="fq-mf-in">
            <span className="k">{col.title}</span>
            <ul className="fq-mf-links">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href}>
                    <FqIcon name={LINK_ICONS[l.href] ?? ICONS[col.title] ?? 'arrow'} />
                    <b>{l.label}</b>
                  </Link>
                </li>
              ))}
              {col.title === 'Legal' && (
                <li>
                  <a href={`mailto:${contact}`}>
                    <FqIcon name="message" />
                    <b>Contact</b>
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div className="ap-mega-foot fq-mf-foot">
            <span>{col.title === 'Legal' ? copyright : tagline}</span>
            {ctas.map((c) => (
              <Link key={c.href + c.label} href={c.href} className={c.primary ? 'btn pa lg' : 'btn lg fq-mf-ghost'}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <nav className="fq-mf-bar" aria-label="Site index">
        <Link href="/feed" className="fq-mf-logo fq-logo-flow" aria-label="Frequency, your Feed" />
        {columns.map((col, i) => (
          <button
            key={col.title}
            type="button"
            className={on === i ? 'on' : undefined}
            aria-expanded={on === i}
            aria-controls={panelId(i)}
            onClick={() => (on === i ? close(false) : setOpen({ i, path: pathname }))}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <FqIcon name={ICONS[col.title] ?? 'arrow'} />
            <span>{col.title}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
