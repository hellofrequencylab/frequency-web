'use client'

// Calm-spine tab bar extracted from app-shell.tsx (LIVE-412). The drawer stays
// in the shell so it can compose NavLinkList without a cycle.

import Link from 'next/link'
import { Globe, Menu, X, Zap } from 'lucide-react'
import { calmSpine, canSee, type NavViewer, type SpineTab } from '@/lib/nav/registry'
import { AREA_ICONS } from '@/components/layout/nav-icons'

// ── Mobile bottom tab bar ─────────────────────────────────────────────────────
// The primary destinations, thumb-reachable along the bottom (the most native
// mobile pattern). The last tab — Menu — opens the full drawer (identity, rewards,
// and the long-tail nav). Keeps full content width: nothing is permanently eaten
// from the side of an already-narrow phone screen.

// The three calm spine destinations (HYG-033: Feed · Events · Marketplace), derived from
// the ONE registry (lib/nav/registry.ts::calmSpine) — no parallel hardcoded list. They
// flank the raised Zap center button. Each tab carries its backing calm NavNode
// (href · gate · icon key); icons still come from AREA_ICONS so the bar stays in lockstep
// with the rail/drawer, and each tab gate-filters through canSee. Order here IS bar order
// (Menu · Feed · Zap · Events · Marketplace). Circles and The Quest live in the drawer.
// Stats moved to the left drawer; Messages moved to the header.

export function MobileTabBar({
  isActive,
  viewer,
  onOpenMenu,
  menuOpen,
  hideAppNav = false,
}: {
  isActive: (href: string) => boolean
  /** The gate identity the spine destinations project through (canSee — the ONE resolver). */
  viewer: NavViewer
  onOpenMenu: () => void
  menuOpen: boolean
  /** Stripped shells (e.g. Studio) hide the app destinations; only the menu arrow remains. */
  hideAppNav?: boolean
}) {
  // The calm spine destinations from the registry, gate-filtered through canSee — the same
  // resolver every surface uses (so a visitor never sees a member-gated tab). Split around
  // the Zap center button: floor(n/2) left of Zap, the rest right (Feed | Zap | Events,
  // Marketplace when the ruled bar is three destinations).
  const tabs = calmSpine().filter((t) => canSee(t.node, viewer))
  const tabsLeft = tabs.slice(0, Math.floor(tabs.length / 2))
  const tabsRight = tabs.slice(Math.floor(tabs.length / 2))

  // Every item — Menu, Zap, and the destination tabs — is flex-1 with the same icon size +
  // stroke weight, so the row reads as one evenly-spaced, uniform set. Active is shown by
  // COLOR only (not a heavier stroke), so weights never differ across the row.
  // 🔴 `min-w-0` IS WHAT MAKES `flex-1` MEAN "an equal fifth". A flex item's default
  // `min-width:auto` floors it at its content width, and here the content is a LABEL. The
  // seven-slot bar summed to 319px against a 320px screen; five slots at 320px are 64px,
  // which is the line Marketplace sits on. `truncate` still clips if a future label overruns;
  // header-fit.test.ts asserts the current labels against that 64px slot.
  const tabClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium transition-colors ${
      active ? 'text-primary-strong' : 'text-muted hover:text-text'
    }`

  const renderTab = (tab: SpineTab) => {
    // Icon key is the node id (AREA_ICONS is keyed by area key, == the node id for spine nodes).
    const Icon = AREA_ICONS[tab.node.icon] ?? Globe
    const active = isActive(tab.node.href)
    return (
      <Link key={tab.node.id} href={tab.node.href} aria-label={tab.label} className={tabClass(active)}>
        <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={2} />
        {/* ONE line, clipped rather than wrapped or overflowing. The tab's accessible name is the
            full label (aria-label on the Link), so a truncated word never costs a screen-reader
            user the destination — and the icon, not the caption, is what a thumb aims at. */}
        <span className="w-full truncate text-center leading-none">{tab.label}</span>
      </Link>
    )
  }

  // The edge buttons (menu + stats) are plain tabs too — same flex-1 width, icon, and weight.
  const handle =
    'flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium text-muted transition-colors active:text-text'

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-sm"
      style={{
        height: 'var(--tab-bar-h)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Left → the nav drawer. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        className={`${handle} ${menuOpen ? 'text-primary-strong' : ''}`}
      >
        {menuOpen ? <X className="h-[22px] w-[22px] shrink-0" strokeWidth={2} /> : <Menu className="h-[22px] w-[22px] shrink-0" strokeWidth={2} />}
        <span className="w-full truncate text-center leading-none">Menu</span>
      </button>

      {!hideAppNav && tabsLeft.map(renderTab)}

      {/* Zap — the action button (ADR-230, restored 2026-09-15 by owner ruling; see ADR-1362).
          Member-facing it's Zap; the backend stays Capture (the 'open-capture' event, the
          captures machinery): Zap is the function that captures. The bolt is a LIGHT glyph on
          the orange button in light mode and a DARK glyph on the gold button at night, with a
          soft catch behind it that flips to match (all tokens).

          LIVE-247 briefly made this disc a Create button whose sheet carried the Zap menu as a
          Post row. The structured creates it hosted are NOT stranded by this revert: /events and
          /circles each carry their own compose button (EventCompose, NewCircleCompose) on every
          viewport, and the desktop feed's CreateMenu still renders the whole CREATE_ITEMS list —
          which keeps the role widening that change was also right about. What the sheet cost was
          the one thing this button is for: Zapping in one tap. */}
      {!hideAppNav && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode: 'post' } }))}
          aria-label="Zap, capture a moment"
          className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-semibold text-primary-strong"
        >
          {/* The circle sits a touch lower than dead-center on the bar's top edge so
              it reads balanced against the flat tabs (its center is 6px below the
              line); the arch above drops to match, keeping the even 12px margin. */}
          <span aria-hidden className="h-[26px] w-[22px]" />
          {/* The fully-rounded white catch the bolt sits in — a floating disc, not a bar bump.
              The lift is `--tab-bar-lift`, not a 22px literal: this disc is slot 0a of the
              mobile stacking contract (components/sidebar/game-stats-dock.tsx), and the same
              number decides how far the content column has to pad to clear it
              (`--tab-bar-clearance`). Two literals that happened to agree is how the teaser
              pill and the RSVP bar each got painted over. */}
          <span aria-hidden className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-[var(--tab-bar-lift)] rounded-pill border border-border bg-surface" />
          <span className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-[18px] items-center justify-center rounded-pill bg-primary shadow-pop">
            {/* the catch behind the glyph — a soft shadow under the bolt (flips with
                the glyph so the carve always reads) */}
            <Zap
              aria-hidden
              className="absolute h-[24px] w-[24px] translate-y-[1.5px] text-primary-strong/40 fill-primary-strong/20 dark:text-on-primary/45 dark:fill-on-primary/25"
              strokeWidth={2}
            />
            {/* the glyph: LIGHT on the orange button in light mode, DARK on the gold
                button in night mode */}
            <Zap
              className="relative h-[24px] w-[24px] text-on-primary fill-on-primary/35 dark:text-ink dark:fill-ink/35"
              strokeWidth={2}
            />
          </span>
          <span className="w-full truncate text-center leading-none">Zap</span>
        </button>
      )}

      {!hideAppNav && tabsRight.map(renderTab)}
    </nav>
  )
}
