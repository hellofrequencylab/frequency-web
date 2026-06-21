'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, ArrowRight } from 'lucide-react'

// ── MegaBar — the shared best-practice header navigation ───────────────────────
// A row of triggers with a SINGLE full-width panel that slides DOWN as a row under the
// header (not a cramped floating dropdown per trigger). One open-state drives the bar:
// hovering / focusing a trigger reveals that section's items as a full-width row; the
// panel anchors to the nearest POSITIONED ancestor, so:
//   - public headers (the fixed/sticky <header>) → it spans the full viewport width.
//   - the admin bar (wrapped in a `relative` element) → it spans the content width.
// Data-driven, so adding a page is a data line. Accessible: real button/link triggers,
// the panel opens on hover AND keyboard focus and closes on Escape / outside-click /
// focus-out / navigation (WCAG 1.4.13 + 2.1.1). Tokens only; no em or en dashes.

export type MegaItem = { label: string; href: string; desc?: string }
export type MegaSection = { heading?: string; items: MegaItem[] }
export type MegaFeatured = { title: string; desc: string; href: string; cta?: string }
/** One trigger in the bar. `sections` empty → a plain link (no panel). `href` set → the
 *  trigger navigates on click while still revealing its panel on hover/focus. */
export type MegaEntry = { label: string; href?: string; sections: MegaSection[]; featured?: MegaFeatured }

type Variant = 'light' | 'dark'

function routeActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function triggerClass(variant: Variant, highlighted: boolean) {
  const dark = variant === 'dark'
  return `inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors motion-reduce:transition-none ${
    dark
      ? highlighted
        ? 'text-white bg-white/10'
        : 'text-white/75 hover:text-white hover:bg-white/10'
      : highlighted
        ? 'text-text bg-surface-elevated'
        : 'text-muted hover:text-text hover:bg-surface-elevated'
  }`
}

export function MegaBar({
  entries,
  variant = 'light',
  ariaLabel = 'Primary',
  className = '',
}: {
  entries: MegaEntry[]
  variant?: Variant
  ariaLabel?: string
  /** Applied to the bar root. The PANEL anchors to the nearest positioned ANCESTOR of this
   *  root, so the caller chooses the span (a positioned header for full width, a `relative`
   *  wrapper for content width). Keep the root itself unpositioned. */
  className?: string
}) {
  const pathname = usePathname()
  const [active, setActive] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const clearTimer = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])
  const open = useCallback(
    (label: string) => {
      clearTimer()
      setActive(label)
    },
    [clearTimer],
  )
  const close = useCallback(() => {
    clearTimer()
    setActive(null)
    setShown(false)
  }, [clearTimer])
  const scheduleClose = useCallback(() => {
    clearTimer()
    closeTimer.current = setTimeout(close, 250)
  }, [clearTimer, close])

  // Slide-in on open: `shown` starts false (set by close()), then settles true next frame.
  // Switching between open triggers keeps it true (the panel persists, no re-slide).
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [active])

  // Close on navigation.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setActive(null)
    setShown(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname])

  // Escape + outside-click close while open.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [active, close])

  useEffect(() => () => clearTimer(), [clearTimer])

  const activeEntry = entries.find((e) => e.label === active) ?? null

  return (
    <div
      ref={ref}
      className={className}
      onMouseEnter={clearTimer}
      onMouseLeave={scheduleClose}
      onBlur={(e) => {
        if (ref.current && !ref.current.contains(e.relatedTarget as Node)) close()
      }}
    >
      <nav className="flex flex-wrap items-center gap-0.5" aria-label={ariaLabel}>
        {entries.map((e) => {
          const hasPanel = e.sections.length > 0
          const highlighted =
            active === e.label ||
            (e.href
              ? routeActive(pathname, e.href)
              : e.sections.some((s) => s.items.some((i) => routeActive(pathname, i.href))))

          if (!hasPanel) {
            return (
              <Link
                key={e.label}
                href={e.href ?? '#'}
                aria-current={e.href && routeActive(pathname, e.href) ? 'page' : undefined}
                className={triggerClass(variant, highlighted)}
              >
                {e.label}
              </Link>
            )
          }

          const inner = (
            <>
              {e.label}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${active === e.label ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </>
          )

          return e.href ? (
            <Link
              key={e.label}
              href={e.href}
              aria-haspopup="true"
              aria-expanded={active === e.label}
              aria-controls={panelId}
              className={triggerClass(variant, highlighted)}
              onMouseEnter={() => open(e.label)}
              onFocus={() => open(e.label)}
            >
              {inner}
            </Link>
          ) : (
            <button
              key={e.label}
              type="button"
              aria-haspopup="true"
              aria-expanded={active === e.label}
              aria-controls={panelId}
              className={triggerClass(variant, highlighted)}
              onMouseEnter={() => open(e.label)}
              onFocus={() => open(e.label)}
              onClick={() => (active === e.label ? close() : open(e.label))}
            >
              {inner}
            </button>
          )
        })}
      </nav>

      {activeEntry && (
        <div
          id={panelId}
          role="region"
          aria-label={activeEntry.label}
          className={`absolute inset-x-0 top-full z-50 border-y border-border bg-surface shadow-pop transition-all duration-200 ease-out motion-reduce:transition-none ${
            shown ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
        >
          <div className="mx-auto flex max-w-[105rem] flex-wrap gap-x-10 gap-y-6 px-4 py-6 sm:px-6 lg:px-8">
            {activeEntry.sections.map((section, si) => (
              <div key={si} className="min-w-[10rem]">
                {section.heading && (
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">
                    {section.heading}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const itemActive = routeActive(pathname, item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={close}
                        className={`block rounded-lg px-2 py-1.5 transition-colors motion-reduce:transition-none ${
                          itemActive ? 'bg-primary-bg' : 'hover:bg-surface-elevated'
                        }`}
                      >
                        <span
                          className={`block text-sm font-semibold ${itemActive ? 'text-primary-strong' : 'text-text'}`}
                        >
                          {item.label}
                        </span>
                        {item.desc && (
                          <span className="mt-0.5 block text-xs leading-snug text-muted">{item.desc}</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}

            {activeEntry.featured && (
              <Link
                href={activeEntry.featured.href}
                onClick={close}
                className="ml-auto hidden w-60 shrink-0 flex-col justify-between rounded-xl border border-border bg-surface-elevated p-4 transition-colors hover:border-border-strong motion-reduce:transition-none lg:flex"
              >
                <div>
                  <p className="text-sm font-bold text-text">{activeEntry.featured.title}</p>
                  <p className="mt-1 text-xs leading-snug text-muted">{activeEntry.featured.desc}</p>
                </div>
                {activeEntry.featured.cta && (
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-strong">
                    {activeEntry.featured.cta}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
