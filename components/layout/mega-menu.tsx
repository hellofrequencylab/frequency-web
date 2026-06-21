'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, ArrowRight } from 'lucide-react'

// ── MegaMenu — the shared best-practice header dropdown ────────────────────────
// One reusable, data-driven panel for every header that needs grouped navigation:
// the public marketing header (organizing the growing set of public pages) and the
// admin area (revealing each section's sub-pages). The component is presentation
// only — callers pass a label + grouped sections, so adding a page is a data line,
// never a component edit.
//
// Behavior (WCAG 1.4.13 + 2.1.1): opens on hover-intent AND click/focus; closes on
// Escape, outside-click, a short hover-out delay (so a brief overshoot between the
// trigger and the panel does not snap it shut), and on navigation. Fully keyboard
// reachable (the trigger is a real button; every item is a real link). Tokens only;
// copy carries no em or en dashes.

export type MegaItem = { label: string; href: string; desc?: string }
export type MegaSection = { heading?: string; items: MegaItem[] }
export type MegaFeatured = { title: string; desc: string; href: string; cta?: string }

type Variant = 'light' | 'dark'

function isItemActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
}

/** The shared trigger styling, also used by sibling direct links so a mega trigger and a
 *  plain link in the same bar read identically. */
export function navTriggerClass(variant: Variant, highlighted: boolean) {
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

export function MegaMenu({
  label,
  href,
  sections,
  featured,
  variant = 'light',
  align = 'left',
}: {
  label: string
  /** When set, the trigger is a LINK that navigates on click (the panel still reveals on
   *  hover / keyboard focus). Used for admin sections, whose label IS the section root.
   *  Without it the trigger is a button that toggles the panel (the public menus). */
  href?: string
  sections: MegaSection[]
  featured?: MegaFeatured
  variant?: Variant
  align?: 'left' | 'right'
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuId = useId()

  // Close on navigation (the active route changed underneath the open panel). Syncing the
  // panel to the router is a legitimate external-system effect, not derived state.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Hover-intent: open at once on enter, close on a short delay (1.4.13).
  function onEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  function onLeave() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 250)
  }
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  const sectionActive = sections.some((s) => s.items.some((i) => isItemActive(pathname, i.href)))
  const cols = Math.max(1, Math.min(sections.length, 3))

  // Keyboard parity with hover (WCAG): the panel opens when focus enters the group and
  // closes when it leaves entirely. The chevron is shared by both trigger shapes.
  const chevron = (
    <ChevronDown
      className={`w-3.5 h-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
      aria-hidden
    />
  )

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (ref.current && !ref.current.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      {href ? (
        <Link
          href={href}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          className={navTriggerClass(variant, sectionActive || open)}
        >
          {label}
          {chevron}
        </Link>
      ) : (
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
          className={navTriggerClass(variant, sectionActive || open)}
        >
          {label}
          {chevron}
        </button>
      )}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute top-full -mt-px z-50 flex gap-5 rounded-2xl border border-border bg-surface p-4 shadow-pop ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div
            className={`grid gap-x-5 gap-y-4 ${
              cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {sections.map((section, si) => (
              <div key={si} className="min-w-[11rem]">
                {section.heading && (
                  <p className="mb-2 px-2 text-2xs font-semibold uppercase tracking-wide text-subtle">
                    {section.heading}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isItemActive(pathname, item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className={`block rounded-xl px-2 py-1.5 transition-colors motion-reduce:transition-none ${
                          active ? 'bg-primary-bg' : 'hover:bg-surface-elevated'
                        }`}
                      >
                        <span
                          className={`block text-sm font-semibold ${active ? 'text-primary-strong' : 'text-text'}`}
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
          </div>

          {featured && (
            <Link
              href={featured.href}
              onClick={() => setOpen(false)}
              className="hidden w-56 shrink-0 flex-col justify-between rounded-xl border border-border bg-surface-elevated p-4 transition-colors hover:border-border-strong motion-reduce:transition-none lg:flex"
            >
              <div>
                <p className="text-sm font-bold text-text">{featured.title}</p>
                <p className="mt-1 text-xs leading-snug text-muted">{featured.desc}</p>
              </div>
              {featured.cta && (
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-strong">
                  {featured.cta}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
