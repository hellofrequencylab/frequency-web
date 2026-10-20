'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { MegaColumn, MegaCta } from './mega-footer'

// THE FOOTER'S MENU (LIVE-1154). The footer is the design system's site footer (`.ft2` in
// design_handoff/frequency/templates/website/web/site.css): a dark band at the end of the page under an
// iridescent rule, the wordmark, the area headings, the copyright and the legal row. Here the area headings
// are tabs: one opens its area's mega panel UP out of the footer, over the page, the way a header tab drops
// its panel down, over the rail docks that rest on the footer's top edge.
//
// Every panel is in the HTML with the footer closed (`hidden`), so a crawler reads the whole index. A tab is
// a disclosure button: Escape or a click outside closes it and hands focus back, ArrowLeft and ArrowRight
// move along the row, a link inside closes it, and a navigation closes it.

const panelId = (i: number) => `fq-mf-p${i}`

export function MegaFooterTabs({
  columns,
  ctas,
  tagline,
  copyright,
  contact,
  legal,
}: {
  columns: readonly MegaColumn[]
  ctas: readonly MegaCta[]
  tagline: string
  copyright: string
  contact: string
  legal: readonly { label: string; href: string }[]
}) {
  const [open, setOpen] = useState<{ i: number; path: string } | null>(null)
  const pathname = usePathname()
  const root = useRef<HTMLDivElement>(null)
  // A panel belongs to the page it opened on, so a navigation closes it without an effect.
  const on = open && open.path === pathname ? open.i : null
  const tab = (i: number) => root.current?.querySelector<HTMLElement>(`[aria-controls="${panelId(i)}"]`)
  const close = useCallback(() => setOpen(null), [])

  useEffect(() => {
    if (on === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      close()
      root.current?.querySelector<HTMLElement>(`[aria-controls="${panelId(on)}"]`)?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    // The panel rises from the footer's top edge, so the footer comes fully into view first and the panel
    // has the window above it to open into.
    root.current?.closest('footer')?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [on, close])

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + columns.length) % columns.length
    tab(next)?.focus()
    if (on !== null) setOpen({ i: next, path: pathname })
  }

  return (
    <div className="fq-mf-in" ref={root}>
      {columns.map((col, i) => (
        <div
          key={col.title}
          id={panelId(i)}
          className="fq-mf-mega"
          role="region"
          aria-label={col.title}
          hidden={on !== i}
          onClick={(e) => {
            if ((e.target as Element).closest('a')) close()
          }}
        >
          <div className="fq-mf-wrap fq-mf-top">
            <div className="fq-mf-brand">
              <b className="fq-mf-h">{col.title}</b>
              <p>{tagline}</p>
              <div className="fq-mf-ctas">
                {ctas.map((c) => (
                  <Link key={c.href + c.label} href={c.href} className={c.primary ? 'btn fq-iri-btn' : 'btn fq-mf-ghost fq-iri-rim'}>
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
            <ul className="fq-mf-links">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
              {col.title === 'Legal' && (
                <li>
                  <a href={`mailto:${contact}`}>Contact</a>
                </li>
              )}
            </ul>
          </div>
        </div>
      ))}

      <div className="fq-mf-wrap fq-mf-row">
        <Link href="/feed" className="fq-mf-logo" aria-label="Frequency, your Feed" />
        <nav className="fq-mf-tabs" aria-label="Site index">
          {columns.map((col, i) => (
            <button
              key={col.title}
              type="button"
              aria-expanded={on === i}
              aria-controls={panelId(i)}
              onClick={() => (on === i ? close() : setOpen({ i, path: pathname }))}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {col.title}
              <svg viewBox="0 0 12 12" aria-hidden>
                <path d="M3 7.5 6 4.5l3 3" />
              </svg>
            </button>
          ))}
        </nav>
      </div>
      <div className="fq-mf-wrap fq-mf-bot">
        <span>{copyright}</span>
        <span className="fq-mf-legal">
          {legal.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${contact}`}>Contact</a>
        </span>
      </div>
    </div>
  )
}
