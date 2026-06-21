'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, ArrowRight } from 'lucide-react'

// ── MegaBar — the shared best-practice header navigation ───────────────────────
// A row of triggers with a SINGLE panel that slides DOWN as a row from UNDER the
// header (not a cramped floating dropdown per trigger). One open-state drives the bar:
// hovering / focusing a trigger reveals that section's items as a row; the panel
// anchors to the nearest POSITIONED ancestor (so it follows a sticky bar on scroll).
//
// SPAN — `panelAlign` decides how wide the visible panel reads:
//   - 'viewport' (default): the panel is a centered max-width row spanning the bar's
//     full width. Used by the public/marketing header, which has no side rails.
//   - 'content': the panel reproduces the app shell's rail SPACERS (a left rail width,
//     the same gap, and optionally a right rail width) inside the centered row, so the
//     visible card lands exactly in the page CONTENT COLUMN between the rails. Used by
//     the in-app member header and the admin sub-header. `rightRail` adds the right
//     spacer (member shell, lg+); omit it where there is no right rail (admin).
//
// MOTION — opens with a slide-out-from-under (translateY reveal from behind the bar,
// which sits opaque + above it). On DISENGAGE the panel LINGERS briefly then FADES out
// (it is not yanked away): pointer-leave starts a grace timer, then the fade; re-entering
// the bar OR the panel cancels it. Escape / outside-click also trigger the fade, not an
// instant unmount. Honors prefers-reduced-motion.
//
// Data-driven, so adding a page is a data line. Accessible: real button/link triggers,
// opens on hover AND keyboard focus, closes on Escape / outside-click / focus-out /
// navigation (WCAG 1.4.13 + 2.1.1). Tokens only; no em or en dashes.

export type MegaItem = { label: string; href: string; desc?: string }
export type MegaSection = { heading?: string; items: MegaItem[] }
export type MegaFeatured = { title: string; desc: string; href: string; cta?: string }
/** One trigger in the bar. `sections` empty → a plain link (no panel). `href` set → the
 *  trigger navigates on click while still revealing its panel on hover/focus. */
export type MegaEntry = { label: string; href?: string; sections: MegaSection[]; featured?: MegaFeatured }

type Variant = 'light' | 'dark'

// Disengage grace before the fade STARTS (a brief overshoot off the bar doesn't snap it
// shut), then the fade duration before the panel unmounts. The fade duration matches the
// CSS transition so the element is gone the moment it finishes animating out.
const LINGER_MS = 280
const FADE_MS = 220

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
  panelAlign = 'viewport',
  rightRail = false,
}: {
  entries: MegaEntry[]
  variant?: Variant
  ariaLabel?: string
  /** Applied to the bar root. The PANEL anchors to the nearest positioned ANCESTOR of this
   *  root, so the caller chooses what the panel follows (a sticky header / sub-header).
   *  Keep the root itself unpositioned. */
  className?: string
  /** 'viewport' = a centered max-width row (marketing). 'content' = reproduce the shell's
   *  rail spacers so the card aligns to the page content column (in-app + admin). */
  panelAlign?: 'viewport' | 'content'
  /** Only meaningful with panelAlign='content': reserve the right rail width (lg+) so the
   *  card stops at the right rail, like the member shell. Omit where there is no right rail. */
  rightRail?: boolean
}) {
  const pathname = usePathname()
  const [active, setActive] = useState<string | null>(null)
  // `shown` drives the slide/fade: true → settled (translate-0, opaque); false → hidden
  // (translated under the bar, transparent). The panel stays MOUNTED while `active` is set,
  // so a close first flips `shown` false (fade out) and only THEN clears `active` (unmount).
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const clearTimers = useCallback(() => {
    if (lingerTimer.current) {
      clearTimeout(lingerTimer.current)
      lingerTimer.current = null
    }
    if (fadeTimer.current) {
      clearTimeout(fadeTimer.current)
      fadeTimer.current = null
    }
  }, [])

  const open = useCallback(
    (label: string) => {
      clearTimers()
      setActive(label)
    },
    [clearTimers],
  )

  // Begin the FADE-OUT: drop `shown` (the panel animates back under the bar + to
  // transparent), then unmount after the transition. Re-engaging before it lands cancels it.
  const beginClose = useCallback(() => {
    clearTimers()
    setShown(false)
    fadeTimer.current = setTimeout(() => setActive(null), FADE_MS)
  }, [clearTimers])

  // Disengage: linger briefly, THEN fade. A re-enter (cancelClose) aborts before the fade.
  const scheduleClose = useCallback(() => {
    clearTimers()
    lingerTimer.current = setTimeout(beginClose, LINGER_MS)
  }, [clearTimers, beginClose])

  // Re-engaged (pointer back over the bar or panel): cancel a pending linger/fade and, if a
  // fade had already started, settle the panel open again so it never half-vanishes.
  const cancelClose = useCallback(() => {
    clearTimers()
    setShown((s) => (active ? true : s))
  }, [clearTimers, active])

  // Slide-in on open: `shown` starts false, then settles true next frame so the entrance
  // animates. Switching between open triggers keeps it true (the panel persists).
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [active])

  // Close instantly on navigation (a link inside it routed away).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    clearTimers()
    setActive(null)
    setShown(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname, clearTimers])

  // Escape + outside-click → FADE out (not an instant unmount).
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose()
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) beginClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [active, beginClose])

  useEffect(() => () => clearTimers(), [clearTimers])

  const activeEntry = entries.find((e) => e.label === active) ?? null

  const columns = activeEntry && (
    <>
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
                  onClick={beginClose}
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
          onClick={beginClose}
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
    </>
  )

  return (
    <div
      ref={ref}
      className={className}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onBlur={(e) => {
        if (ref.current && !ref.current.contains(e.relatedTarget as Node)) beginClose()
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
              onClick={() => (active === e.label ? beginClose() : open(e.label))}
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
          // z BELOW the bar (the bar is opaque + higher), so the panel tucks UNDER it and
          // slides out from behind its bottom edge. `top-full` pins it to the bar's base.
          className={`absolute inset-x-0 top-full z-20 border-b border-border bg-surface shadow-pop transition-all duration-200 ease-out motion-reduce:transition-none ${
            shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
          }`}
        >
          {panelAlign === 'content' ? (
            // Reproduce the shell's body grid (centered max-w, the same gap, and rail-width
            // SPACERS) so the visible card lands exactly in the content column between rails.
            <div className="mx-auto flex max-w-[105rem] gap-8 px-4 sm:px-6 lg:px-8">
              <div className="hidden w-48 shrink-0 md:block" aria-hidden />
              <div className="min-w-0 flex-1 py-6">
                <div className="flex flex-wrap gap-x-10 gap-y-6">{columns}</div>
              </div>
              {rightRail && <div className="hidden w-72 shrink-0 lg:block" aria-hidden />}
            </div>
          ) : (
            <div className="mx-auto flex max-w-[105rem] flex-wrap gap-x-10 gap-y-6 px-4 py-6 sm:px-6 lg:px-8">
              {columns}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
