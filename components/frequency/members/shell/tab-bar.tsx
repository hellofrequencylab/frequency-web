'use client'

// THE FREQUENCY PHONE TAB BAR: DAWN's bottom bar (components/layout/app-shell-mobile.tsx MobileTabBar,
// HYG-033) carried into the Frequency member shell. Same five slots in the same order, Menu · Feed ·
// Zap · Events · Marketplace, the destinations read from the ONE registry (calmSpine) and gate-filtered
// through canSee, so a visitor never sees a member-gated tab. Drawn in the kit's idiom: a floating
// frosted pill with the iridescent wash, the active tab in the section pill's gradient, and Zap as a
// raised breathing orb.
//
// Shown under 768px (members-shell.css), Tailwind's `md`, so every overlay that clears the DAWN bar
// with `md:` classes and the --tab-bar-* lane tokens clears this one too. The header owns the state
// (the drawer and the Zap sheet are its menus) and draws this bar, so a full-viewport editor that
// drops the header drops the bar with it.

import Link from 'next/link'
import { forwardRef } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { calmSpine, canSee, type NavViewer } from '@/lib/nav/registry'

/** The Frequency glyph for each spine destination (the registry's ids). */
const TAB_ICON: Record<string, FqIconName> = { feed: 'home', events: 'event', market: 'tag' }

/** Is `href` the page the member is on, or a page under it? */
export function tabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

interface FqTabBarProps {
  pathname: string
  viewer: NavViewer
  menuOpen: boolean
  zapOpen: boolean
  onMenu: () => void
  onZap: () => void
  /** A small count on the Menu tab: the viewer's Circles with something new. */
  menuCount: number
}

export const FqTabBar = forwardRef<HTMLButtonElement, FqTabBarProps>(function FqTabBar(
  { pathname, viewer, menuOpen, zapOpen, onMenu, onZap, menuCount },
  menuRef,
) {
  const tabs = calmSpine().filter((t) => canSee(t.node, viewer))
  const split = Math.floor(tabs.length / 2)
  const tab = (t: (typeof tabs)[number]) => {
    const on = !menuOpen && !zapOpen && tabActive(pathname, t.node.href)
    return (
      <Link
        key={t.node.id}
        href={t.node.href}
        className={on ? 'fqm-tb on' : 'fqm-tb'}
        aria-current={on ? 'page' : undefined}
        aria-label={t.label}
      >
        <span className="fqm-tb-ic">
          <FqIcon name={TAB_ICON[t.node.id] ?? 'compass'} />
        </span>
        <span className="fqm-tb-l">{t.label}</span>
      </Link>
    )
  }
  return (
    <nav className="fqm-tabbar" aria-label="Main">
      <button
        ref={menuRef}
        type="button"
        className={menuOpen ? 'fqm-tb on' : 'fqm-tb'}
        aria-label={menuOpen ? 'Close the menu' : 'Open the menu'}
        aria-expanded={menuOpen}
        aria-controls="fqm-drawer"
        onClick={onMenu}
      >
        <span className="fqm-tb-ic">
          {menuOpen ? <FqIcon name="close" /> : <svg className="fq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>}
          {menuCount > 0 && !menuOpen && <i aria-hidden />}
        </span>
        <span className="fqm-tb-l">Menu</span>
      </button>
      {tabs.slice(0, split).map(tab)}
      <button
        type="button"
        className={zapOpen ? 'fqm-tb fqm-tb-zap on' : 'fqm-tb fqm-tb-zap'}
        aria-label={zapOpen ? 'Close Zap' : 'Zap, capture a moment'}
        aria-expanded={zapOpen}
        aria-controls="fqm-zap"
        onClick={onZap}
      >
        <span className="fqm-tb-orb">
          <FqIcon name={zapOpen ? 'close' : 'zap'} />
        </span>
        <span className="fqm-tb-l">Zap</span>
      </button>
      {tabs.slice(split).map(tab)}
    </nav>
  )
})
