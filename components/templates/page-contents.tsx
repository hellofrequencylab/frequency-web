'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// A reusable in-page "table of contents" — a sticky, horizontally-scrollable bar
// of a page's sections. Two modes, same chrome:
//
//  • SCROLL-SPY (`sections`): chips jump to on-page sections and track the active
//    one as you scroll. For long pages with stacked sections (Channels, Practices…).
//
//      <PageContents sections={[{ id: 'channel-mind', label: 'Mind', count: 6 }]} />
//
//  • FILTER / drill-down (`links`): chips are links that set a category (a URL
//    param), so tapping one shows just that category's items — the "pages within".
//    For collection pages grouped by a facet (Circles by Channel…).
//
//      <PageContents links={[{ href: '/circles', label: 'All', active: true }, …]} />
//
// Sticks under the app header, full-bleed within the page padding, mobile-first
// (the bar scrolls, not the page).

export type PageContentsSection = { id: string; label: string; count?: number }
export type PageContentsLink = { href: string; label: string; count?: number; active: boolean }

const CHIP = (on: boolean) =>
  `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    on ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-muted hover:text-text'
  }`

function Count({ on, n }: { on: boolean; n: number }) {
  return <span className={`text-xs tabular-nums ${on ? 'text-on-primary/80' : 'text-subtle'}`}>{n}</span>
}

function Bar({
  children,
  barRef,
  rightSlot,
  divider = true,
}: {
  children: React.ReactNode
  barRef?: React.Ref<HTMLDivElement>
  /** Optional content parked at the right of the bar (e.g. a stat strip). */
  rightSlot?: React.ReactNode
  /** The hairline under the bar; pass false to drop it. */
  divider?: boolean
}) {
  return (
    <nav
      aria-label="On this page"
      className={`sticky top-0 z-10 -mx-4 mb-6 bg-canvas/90 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6 ${
        divider ? 'border-b border-border' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div ref={barRef} className="flex gap-1.5 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        {rightSlot && <div className="hidden shrink-0 sm:block">{rightSlot}</div>}
      </div>
    </nav>
  )
}

export function PageContents(
  props:
    | { sections: PageContentsSection[] }
    | { links: PageContentsLink[]; rightSlot?: React.ReactNode; divider?: boolean },
) {
  if ('links' in props) return <FilterBar links={props.links} rightSlot={props.rightSlot} divider={props.divider} />
  return <ScrollSpyBar sections={props.sections} />
}

// ── Filter / drill-down mode ──────────────────────────────────────────────────

function FilterBar({
  links,
  rightSlot,
  divider,
}: {
  links: PageContentsLink[]
  rightSlot?: React.ReactNode
  divider?: boolean
}) {
  const barRef = useRef<HTMLDivElement>(null)

  // Keep the active chip in view (e.g. after landing on a filtered URL).
  useEffect(() => {
    const active = barRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [])

  // Still render when there's a right slot (the stats) even with a single chip.
  if (links.length < 2 && !rightSlot) return null

  return (
    <Bar barRef={barRef} rightSlot={rightSlot} divider={divider}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.active ? 'page' : undefined} className={CHIP(l.active)}>
          {l.label}
          {l.count != null && <Count on={l.active} n={l.count} />}
        </Link>
      ))}
    </Bar>
  )
}

// ── Scroll-spy mode ───────────────────────────────────────────────────────────

function ScrollSpyBar({ sections }: { sections: PageContentsSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sections.length === 0) return
    // The document is the scroll container now, so observe against the viewport.
    const root = null
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el)
    if (els.length === 0) return

    const io = new IntersectionObserver(
      (entries) => {
        const inBand = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (inBand[0]) setActive(inBand[0].target.id)
      },
      { root, rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sections])

  useEffect(() => {
    if (!active || !barRef.current) return
    const chip = barRef.current.querySelector<HTMLElement>(`[data-toc="${active}"]`)
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])

  if (sections.length < 2) return null

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <Bar barRef={barRef}>
      {sections.map((s) => {
        const on = active === s.id
        return (
          <button key={s.id} type="button" data-toc={s.id} onClick={() => go(s.id)} aria-current={on ? 'true' : undefined} className={CHIP(on)}>
            {s.label}
            {s.count != null && <Count on={on} n={s.count} />}
          </button>
        )
      })}
    </Bar>
  )
}
