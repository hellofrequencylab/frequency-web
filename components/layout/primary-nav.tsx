'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { DISCOVER_NAV, SITE_NAV, SITE_NAV_MEMBER, type NavLink } from '@/lib/site'

// ── Unified primary navigation ────────────────────────────────────────────────
// One nav for every header so the splash and the community feel like one place.
// "Discover" (the live community) is a dropdown; the mission/site pages sit
// beside it as flat tabs. Members get a mission-focused set (no Pricing/Demo).
// Desktop only; the in-app mobile drawer + the marketing Join CTA cover phones.

type Variant = 'light' | 'dark'

function isItemActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
}

function Dropdown({
  label,
  items,
  variant,
  align = 'left',
}: {
  label: string
  items: NavLink[]
  variant: Variant
  align?: 'left' | 'right'
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  const sectionActive = items.some((i) => isItemActive(pathname, i.href))
  const dark = variant === 'dark'

  const triggerClass = `inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
    dark
      ? sectionActive || open
        ? 'text-white bg-white/10'
        : 'text-white/75 hover:text-white hover:bg-white/10'
      : sectionActive || open
        ? 'text-text bg-surface-elevated'
        : 'text-muted hover:text-text hover:bg-surface-elevated'
  }`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
      >
        {label}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute top-full -mt-px w-72 rounded-b-2xl border border-t-0 border-border bg-surface shadow-pop p-1.5 z-50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => {
            const active = isItemActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`block rounded-xl px-3 py-2.5 transition-colors ${
                  active ? 'bg-primary-bg' : 'hover:bg-surface-elevated'
                }`}
              >
                <span
                  className={`block text-sm font-bold ${active ? 'text-primary-strong' : 'text-text'}`}
                >
                  {item.label}
                </span>
                {item.desc && (
                  <span className="block text-xs text-muted mt-0.5 leading-snug">{item.desc}</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PrimaryNav({
  variant = 'light',
  audience = 'visitor',
  className = '',
  showDiscover = true,
}: {
  variant?: Variant
  /** Members get the mission-focused tabs (no Pricing/Demo). */
  audience?: 'visitor' | 'member'
  className?: string
  /** Hide the "Discover" dropdown — e.g. in the app shell, where the community
   *  sub-menu already owns discovery and this nav is just full-site browsing. */
  showDiscover?: boolean
}) {
  const pathname = usePathname()
  const siteItems = audience === 'member' ? SITE_NAV_MEMBER : SITE_NAV
  const dark = variant === 'dark'

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      dark
        ? active
          ? 'text-white bg-white/10'
          : 'text-white/75 hover:text-white hover:bg-white/10'
        : active
          ? 'text-text bg-surface-elevated'
          : 'text-muted hover:text-text hover:bg-surface-elevated'
    }`

  return (
    <nav className={`hidden md:flex items-center gap-0.5 ${className}`} aria-label="Primary">
      {siteItems.map((item) => (
        <Link key={item.href} href={item.href} className={tabClass(isItemActive(pathname, item.href))}>
          {item.label}
        </Link>
      ))}
      {showDiscover && <Dropdown label="Discover" items={DISCOVER_NAV} variant={variant} align="left" />}
    </nav>
  )
}
