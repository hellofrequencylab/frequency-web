'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, ArrowRight } from 'lucide-react'
import type {
  MenuAccess,
  ResolvedCategory,
  ResolvedItem,
  ResolvedMenu,
  ResolvedRailCard,
} from '@/lib/menus/types'
import { effectiveMode } from '@/components/layout/menu-role'
import { GhostLink } from '@/components/layout/ghost-link'
import {
  SHELL_ROW_CLASS,
  SHELL_ROW_GAP_CLASS,
  LEFT_RAIL_CLASS,
  RIGHT_RAIL_CLASS,
  RIGHT_RAIL_ML_CLASS,
  RAIL_STRIP_CLASS,
} from '@/lib/layout/shell-metrics'

// ── MegaBar — the shared best-practice header navigation ───────────────────────
// A row of triggers with a SINGLE panel that slides DOWN as a row from UNDER the
// header (not a cramped floating dropdown per trigger). One open-state drives the bar:
// hovering / focusing a trigger reveals that section's items as a row; the panel
// anchors to the nearest POSITIONED ancestor (so it follows a sticky bar on scroll).
//
// DATA — driven by the DB-backed menu system (lib/menus). The bar takes one or more
// ResolvedMenus and a `triggerLevel`:
//   - 'menu' (public headers): each ResolvedMenu is ONE trigger (its `label`), and its
//     panel renders the menu's top-level categories as columns, its rootItems, and its
//     rail cards. Pass [public_discover, public_explore] for the marketing/site header.
//   - 'category' (admin sub-header): a SINGLE ResolvedMenu whose top-level categories are
//     each a trigger; a trigger's panel renders that category's CHILDREN as columns (plus
//     the category's own items and the menu's rail cards). Mirrors the old ADMIN_NAV bar.
// The reader returns everything; this renderer does the per-role / per-mode filtering via
// `viewerRole` + effectiveMode (active = a link, ghost = a muted upsell, hidden = dropped).
//
// GRID — when a category / item / rail card carries free-grid placement (gridCol/gridRow/
// colSpan, with the menu's `columns` count), the panel lays out on an explicit CSS grid so
// the operator can place things precisely. When no placement is present it falls back to the
// current auto-flow (flex-wrap), so an unseeded / default menu never looks broken.
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
// MOTION — opens with a slide-out-from-under (translateY reveal from behind the bar, which
// sits opaque + above it). Opens on CLICK only (owner directive: never on hover/rollover).
// AUTO-CLOSES on disengage: once open, a pointer-leave starts the DWELL timer (from the Menu
// Manager speed settings), then fades; re-entering the bar or panel cancels it. Escape,
// outside-click, scroll, and navigation also fade it closed. Honors prefers-reduced-motion.
//
// Accessible: real button/link triggers; the panel toggles on click (Enter/Space on the
// button), closes on Escape / outside-click / focus-out / navigation (WCAG 1.4.13 + 2.1.1).
// Tokens only; no em or en dashes.

type Variant = 'light' | 'dark'

// Default motion timings (ms). The global Menu Manager speed settings override these via the
// `timings` prop; the constants are the fallback when none is passed.
//   - OPEN_DELAY: grace after the trigger is clicked before the panel opens (0 = immediate).
//   - DWELL: once open, how long the panel LINGERS after the pointer leaves before it fades
//     (the auto-close delay); a longer dwell forgives a brief overshoot.
//   - FADE: the fade-out duration; it matches the CSS transition so the panel unmounts the
//     moment it finishes animating out.
const DEFAULT_OPEN_DELAY_MS = 0
const DEFAULT_DWELL_MS = 1500
const DEFAULT_FADE_MS = 240

// How far the page must actually move before a scroll dismisses an open panel. Big enough to
// absorb trackpad inertia and a mobile address bar collapsing, small enough that a deliberate
// scroll still closes it on the first flick.
const SCROLL_DISMISS_PX = 24

// ── Resolved-menu adapter ─────────────────────────────────────────────────────
// The bar renders from a uniform shape regardless of triggerLevel: a list of TRIGGERS,
// each with the panel's columns (categories), loose root items, and rail cards. Computed
// once per menus/level change (useMemo) so render stays cheap.
type Trigger = {
  /** Stable key for React + open-state matching. */
  key: string
  label: string
  /** Optional navigable href for the trigger itself (the category's / menu's landing). */
  href?: string
  columns: number
  categories: ResolvedCategory[]
  rootItems: ResolvedItem[]
  railCards: ResolvedRailCard[]
}

function buildTriggers(menus: ResolvedMenu[], triggerLevel: 'menu' | 'category'): Trigger[] {
  if (triggerLevel === 'category') {
    // Admin: the single menu's top-level categories are the triggers. CLICK-TO-OPEN model:
    // a category WITH a panel (child columns or more than one item) is a disclosure BUTTON
    // (no trigger href), and ALL its items — including the section landing — ride inside the
    // panel, so nothing is unreachable without a hover. A single-link section stays a plain
    // nav link (its one item's href, no panel).
    const menu = menus[0]
    if (!menu) return []
    return menu.categories.map((cat) => {
      const hasPanel = cat.children.length > 0 || cat.items.length > 1
      return {
        key: cat.id,
        label: cat.label ?? menu.label,
        href: hasPanel ? undefined : cat.items[0]?.href,
        columns: menu.columns,
        categories: cat.children,
        rootItems: hasPanel ? cat.items : [],
        railCards: menu.railCards,
      }
    })
  }
  // Public: each menu is one trigger; its categories are the panel columns.
  return menus.map((menu) => ({
    key: menu.surfaceKey,
    label: menu.label,
    columns: menu.columns,
    categories: menu.categories,
    rootItems: menu.rootItems,
    railCards: menu.railCards,
  }))
}

// True when ANY placed element carries explicit grid coordinates — the cue to lay the
// panel out on an explicit CSS grid rather than the auto-flow flex-wrap fallback.
function hasGridPlacement(t: Trigger): boolean {
  const catPlaced = t.categories.some(
    (c) => c.gridCol != null || c.gridRow != null || c.items.some((i) => i.gridCol != null || i.gridRow != null),
  )
  const rootPlaced = t.rootItems.some((i) => i.gridCol != null || i.gridRow != null)
  return catPlaced || rootPlaced
}

// CSS grid-placement style for a placed element (1-based columns/rows). colSpan widens it
// across columns; a missing col/row lets the grid auto-flow that axis.
function gridStyle(el: {
  gridCol?: number
  gridRow?: number
  colSpan?: number
}): React.CSSProperties {
  const style: React.CSSProperties = {}
  if (el.gridCol != null) {
    style.gridColumn = el.colSpan && el.colSpan > 1 ? `${el.gridCol} / span ${el.colSpan}` : `${el.gridCol}`
  } else if (el.colSpan && el.colSpan > 1) {
    style.gridColumn = `span ${el.colSpan}`
  }
  if (el.gridRow != null) style.gridRow = `${el.gridRow}`
  return style
}

// How many columns a loose-item list flows into. Tuned to the rows themselves, not the menu's
// `columns` count: a dropdown of four links wants one tidy column, not four of one item each.
// Capped at three so a column never gets narrower than a two-line subheading reads well.
function columnsFor(count: number): number {
  if (count <= 4) return 1
  if (count <= 8) return 2
  return 3
}

/** Split a list into `n` roughly equal, ORDER-PRESERVING columns (read down, then across).
 *  `n <= 1` or an empty list returns a single chunk, so the caller has one code path. PURE. */
function chunk<T>(items: T[], n: number): T[][] {
  if (items.length === 0) return []
  if (n <= 1) return [items]
  const per = Math.ceil(items.length / n)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per))
  return out
}

function routeActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function triggerClass(variant: Variant, highlighted: boolean) {
  const dark = variant === 'dark'
  return `inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-body-sm font-semibold transition-colors motion-reduce:transition-none ${
    dark
      ? highlighted
        ? 'text-on-ink bg-on-ink/10'
        : 'text-on-ink-muted hover:text-on-ink hover:bg-on-ink/10'
      : highlighted
        ? 'text-text bg-surface-elevated'
        : 'text-muted hover:text-text hover:bg-surface-elevated'
  }`
}

export function MegaBar({
  menus,
  triggerLevel = 'menu',
  viewerRole = 'visitor',
  variant = 'light',
  ariaLabel = 'Primary',
  className = '',
  panelAlign = 'viewport',
  rightRail = false,
  leftFolded = false,
  rightFolded = false,
  cardGutters = false,
  timings,
  panelHeader,
  isAuth = false,
}: {
  /** The DB-backed (or code-default) menus this bar renders, in trigger order. */
  menus: ResolvedMenu[]
  /** 'menu' = one trigger per menu (public headers); 'category' = one trigger per
   *  top-level category of a single menu (admin sub-header). */
  triggerLevel?: 'menu' | 'category'
  /** The viewer collapsed to a single MenuAccess token (components/layout/menu-role).
   *  Drives per-item / per-card mode resolution (active / ghost / hidden). */
  viewerRole?: MenuAccess
  variant?: Variant
  ariaLabel?: string
  /** Motion timings (ms) from the global Menu Manager speed settings; falls back to the
   *  module defaults. openDelayMs = hover-intent before open; dwellMs = linger before the
   *  fade; fadeMs = fade-out duration (also drives the slide transition). */
  timings?: { openDelayMs?: number; dwellMs?: number; fadeMs?: number }
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
  /** The rails' CURRENT fold state, so the panel's spacers track the shell instead of assuming
   *  both rails are open. Only meaningful with panelAlign='content'. */
  leftFolded?: boolean
  rightFolded?: boolean
  /** Frame the panel as a fixed `columns`-wide grid: dropdown content always begins at
   *  COLUMN 2 (never flush-left), and columns 1 + last are reserved as gutters for the
   *  optional left/right rail cards. The header uses this; skipped under explicit grid
   *  placement (gridCol/gridRow), where the operator controls exact placement. */
  cardGutters?: boolean
  /** Optional node rendered at the TOP of the panel body (content align only), e.g. the admin
   *  search bar, so the menu can be searched while it stays open. */
  panelHeader?: React.ReactNode
  /** Whether the viewer is signed in. Drives the Home⇄Feed toggle on the marketing header,
   *  which renders with a fixed 'visitor' viewerRole (so viewerRole alone can't tell). The
   *  in-app/site headers pass a real viewerRole, so they don't need this. */
  isAuth?: boolean
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
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The trigger that opened the panel, so Escape can hand focus back to it.
  const triggerRef = useRef<HTMLElement | null>(null)
  const panelId = useId()

  const triggers = useMemo(() => buildTriggers(menus, triggerLevel), [menus, triggerLevel])

  const openDelayMs = timings?.openDelayMs ?? DEFAULT_OPEN_DELAY_MS
  const dwellMs = timings?.dwellMs ?? DEFAULT_DWELL_MS
  const fadeMs = timings?.fadeMs ?? DEFAULT_FADE_MS

  const clearTimers = useCallback(() => {
    if (lingerTimer.current) {
      clearTimeout(lingerTimer.current)
      lingerTimer.current = null
    }
    if (fadeTimer.current) {
      clearTimeout(fadeTimer.current)
      fadeTimer.current = null
    }
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }, [])

  const open = useCallback(
    (key: string) => {
      clearTimers()
      if (openDelayMs > 0) {
        openTimer.current = setTimeout(() => setActive(key), openDelayMs)
      } else {
        setActive(key)
      }
    },
    [clearTimers, openDelayMs],
  )

  // Begin the FADE-OUT: drop `shown` (the panel animates back under the bar + to
  // transparent), then unmount after the transition.
  const beginClose = useCallback(() => {
    clearTimers()
    setShown(false)
    fadeTimer.current = setTimeout(() => setActive(null), fadeMs)
  }, [clearTimers, fadeMs])

  // Disengage (pointer left the open bar + panel): linger for the DWELL, THEN fade. A re-enter
  // (cancelClose) aborts before the fade. This is the auto-close; opening stays click-only.
  const scheduleClose = useCallback(() => {
    clearTimers()
    lingerTimer.current = setTimeout(beginClose, dwellMs)
  }, [clearTimers, beginClose, dwellMs])

  // Re-engaged (pointer back over the bar or panel): cancel a pending linger/fade and, if a fade
  // had already started, settle the panel open again so it never half-vanishes.
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

  // Escape + outside-click + scroll → FADE out (not an instant unmount). Scrolling the page
  // while the panel is open dismisses it (content moving under a pinned panel reads as stale),
  // matching the click-away behavior.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      // Escape returns focus to the trigger that opened the panel. Without this a keyboard
      // user who dismissed the menu was dropped at the top of the document and had to tab
      // back through the whole header (WCAG 2.4.3 Focus Order). `activeRef` is set on open.
      if (e.key === 'Escape') {
        beginClose()
        triggerRef.current?.focus()
      }
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) beginClose()
    }
    // ── SCROLL DISMISSAL HAS A THRESHOLD ─────────────────────────────────────────────────
    // This used to close on ANY scroll event. On a trackpad, one pixel of inertial drift with
    // the pointer resting inside the open panel closed it — and on iOS/Android a scroll fires
    // from the address bar collapsing, which no member did on purpose. The intent was real
    // (content moving under a pinned panel reads as stale), so the rule is kept and given a
    // deadband: dismiss once the page has genuinely moved.
    const openedAt = window.scrollY
    const onScroll = () => {
      if (Math.abs(window.scrollY - openedAt) > SCROLL_DISMISS_PX) beginClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll)
    }
  }, [active, beginClose])

  useEffect(() => () => clearTimers(), [clearTimers])

  const activeTrigger = triggers.find((t) => t.key === active) ?? null

  // One leaf link. Resolves its mode for the viewer: hidden → null (caller drops it),
  // active → a real Link, ghost → a muted GhostLink opening the upgrade lightbox.
  const renderItem = (item: ResolvedItem) => {
    const mode = effectiveMode(item, viewerRole)
    if (mode === 'hidden') return null

    const inner = (
      <>
        <span className="block text-body-sm font-semibold text-text">{item.label}</span>
        {item.subheading && (
          <span className="mt-0.5 block text-meta leading-snug text-muted">{item.subheading}</span>
        )}
      </>
    )

    if (mode === 'ghost') {
      return (
        <GhostLink
          key={item.id}
          ghostTier={item.ghostTier}
          ghostMessage={item.ghostMessage}
          ariaLabel={item.label}
          className="block rounded-lg px-2 py-1.5"
        >
          {inner}
        </GhostLink>
      )
    }

    const itemActive = routeActive(pathname, item.href)
    return (
      <Link
        key={item.id}
        href={item.href}
        onClick={beginClose}
        className={`block rounded-lg px-2 py-1.5 transition-colors motion-reduce:transition-none ${
          itemActive ? 'bg-primary-bg' : 'hover:bg-surface-elevated'
        }`}
      >
        <span className={`block text-body-sm font-semibold ${itemActive ? 'text-primary-strong' : 'text-text'}`}>
          {item.label}
        </span>
        {item.subheading && (
          <span className="mt-0.5 block text-meta leading-snug text-muted">{item.subheading}</span>
        )}
      </Link>
    )
  }

  // One column (a category). Renders its heading, its own items, and recurses into any
  // nested child categories. Returns null when the whole column resolves empty for the viewer.
  const renderCategory = (cat: ResolvedCategory, useGrid: boolean): React.ReactNode => {
    const items = cat.items.map(renderItem).filter(Boolean)
    const children = cat.children.map((c) => renderCategory(c, false)).filter(Boolean)
    if (items.length === 0 && children.length === 0) return null
    return (
      <div key={cat.id} className="min-w-[10rem]" style={useGrid ? gridStyle(cat) : undefined}>
        {cat.label && (
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">{cat.label}</p>
        )}
        {items.length > 0 && <div className="space-y-0.5">{items}</div>}
        {children.length > 0 && <div className="mt-3 space-y-3">{children}</div>}
      </div>
    )
  }

  // One rail card (a featured tile). Mode-resolved like items; ghost opens the lightbox.
  const renderRailCard = (card: ResolvedRailCard) => {
    const mode = effectiveMode(card, viewerRole)
    if (mode === 'hidden') return null

    const body = (
      <>
        <div>
          <p className="text-body-sm font-bold text-text">{card.title}</p>
          <p className="mt-1 text-meta leading-snug text-muted">{card.body}</p>
        </div>
        {card.cta && (
          <span className="mt-3 inline-flex items-center gap-1 text-meta font-semibold text-primary-strong">
            {card.cta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </>
    )

    const cardBox =
      'flex w-60 shrink-0 flex-col justify-between rounded-card border border-border bg-surface-elevated p-4'

    if (mode === 'ghost') {
      return (
        <GhostLink
          key={card.id}
          ghostTier={undefined}
          ghostMessage={undefined}
          ariaLabel={card.title}
          className={`${cardBox} ${card.side === 'right' ? 'ml-auto' : ''} hidden lg:flex`}
        >
          {body}
        </GhostLink>
      )
    }

    return (
      <Link
        key={card.id}
        href={card.href}
        onClick={beginClose}
        className={`${cardBox} transition-colors hover:border-border-strong motion-reduce:transition-none ${
          card.side === 'right' ? 'ml-auto' : ''
        } hidden lg:flex`}
      >
        {body}
      </Link>
    )
  }

  // The full panel body for the active trigger: left rail cards, then the columns +
  // loose root items, then right rail cards. Lays out on an explicit grid when any
  // element carries placement; otherwise flex-wraps (the safe default).
  const panelBody = activeTrigger && (() => {
    const useGrid = hasGridPlacement(activeTrigger)
    const leftCards = activeTrigger.railCards.filter((c) => c.side === 'left')
    const rightCards = activeTrigger.railCards.filter((c) => c.side !== 'left')
    const categoryColumns = activeTrigger.categories.map((c) => renderCategory(c, useGrid)).filter(Boolean)
    const looseItems = activeTrigger.rootItems.map(renderItem).filter(Boolean)
    const colCount = activeTrigger.columns

    // ── LOOSE ITEMS FLOW INTO COLUMNS ────────────────────────────────────────────────
    //
    // 🔴 They used to go into ONE `min-w-[10rem]` div, all of them, however many there were.
    // That is not a small thing on the live header: `triggerLevel='category'` puts a trigger's
    // CHILDREN in `categories` and its own links in `rootItems`, and the header tree is one
    // level deep — so `categories` is always empty and EVERY dropdown took this branch. The
    // Spaces panel stacked six links in a 170px column inside a 1,139px band, and about a
    // thousand of those pixels were blank (docs/MENU-AUDIT-2026-08-06.md §2.1).
    //
    // Chunking here rather than `columns: N` CSS on purpose: multi-column would let one link's
    // two-line subheading break across a column boundary, and these rows are label + subheading.
    // Explicit chunks keep each row whole and read top-to-bottom, then left-to-right.
    const looseColumns = chunk(looseItems, columnsFor(looseItems.length))

    const content = (
      <>
        {categoryColumns}
        {looseColumns.map((col, i) => (
          <div key={`loose-${i}`} className="min-w-[10rem] flex-1">
            <div className="space-y-0.5">{col}</div>
          </div>
        ))}
      </>
    )

    // Gutter layout (owner directive): a fixed colCount-wide grid where the dropdown
    // content always begins at COLUMN 2 (never flush-left), and columns 1 + colCount are
    // reserved as gutters for the optional left/right rail cards. Skipped under explicit
    // grid placement (gridCol/gridRow), where the operator controls exact placement, and
    // when colCount is too small to leave a center band.
    // ── GUTTERS ARE RESERVED ONLY FOR CARDS THAT EXIST ───────────────────────────────
    //
    // 🔴 This branch used to reserve grid column 1 AND column `colCount` unconditionally, for
    // rail cards, whenever `cardGutters` was set and the menu had 3+ columns. PrimaryNav always
    // sets `cardGutters`, the header menu is `columns: 6`, and there is not one rail card in the
    // database on any surface — so two of six columns, a third of the panel, were permanently
    // empty on every dropdown the product has ever shown (audit §2.1).
    //
    // A gutter is now a consequence of a card, not a prerequisite for one. With cards on both
    // sides the layout is exactly what it was; with none, the content simply gets the width.
    if (cardGutters && !useGrid && colCount >= 3 && (leftCards.length > 0 || rightCards.length > 0)) {
      const start = leftCards.length > 0 ? 2 : 1
      const end = rightCards.length > 0 ? colCount : colCount + 1
      return (
        <div
          className="grid w-full gap-x-10 gap-y-6"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {leftCards.length > 0 && <div style={{ gridColumn: '1' }}>{leftCards.map(renderRailCard)}</div>}
          <div className="flex flex-wrap gap-x-10 gap-y-6" style={{ gridColumn: `${start} / ${end}` }}>
            {content}
          </div>
          {rightCards.length > 0 && (
            <div style={{ gridColumn: `${colCount}` }}>{rightCards.map(renderRailCard)}</div>
          )}
        </div>
      )
    }

    const grid = (
      <div
        className={useGrid ? 'grid gap-x-10 gap-y-6' : 'flex flex-wrap gap-x-10 gap-y-6'}
        style={useGrid ? { gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` } : undefined}
      >
        {content}
      </div>
    )

    return (
      <div className="flex w-full gap-x-10">
        {leftCards.map(renderRailCard)}
        <div className="min-w-0 flex-1">{grid}</div>
        {rightCards.map(renderRailCard)}
      </div>
    )
  })()

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
        {triggers.map((t) => {
          // A trigger with no panel content (no columns and no loose items) is a plain link.
          const hasPanel = t.categories.length > 0 || t.rootItems.length > 0
          const highlighted =
            active === t.key ||
            (t.href
              ? routeActive(pathname, t.href)
              : t.categories.some((c) => c.items.some((i) => routeActive(pathname, i.href))) ||
                t.rootItems.some((i) => routeActive(pathname, i.href)))

          if (!hasPanel) {
            // The "Home" trigger (href '/') is a Home⇄Feed toggle for signed-in members
            // (owner directive): on the feed it offers "Home", everywhere else it offers
            // "Feed", so one button bounces between the brand home and the member's feed.
            // A visitor (no feed) keeps a plain "Home".
            let href = t.href ?? '#'
            let label = t.label
            if (t.href === '/' && (isAuth || viewerRole !== 'visitor')) {
              const onFeed = pathname === '/feed' || pathname.startsWith('/feed/')
              href = onFeed ? '/' : '/feed'
              label = onFeed ? 'Home' : 'Feed'
            }
            return (
              <Link
                key={t.key}
                href={href}
                aria-current={routeActive(pathname, href) ? 'page' : undefined}
                className={triggerClass(variant, highlighted)}
              >
                {label}
              </Link>
            )
          }

          const inner = (
            <>
              {t.label}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${active === t.key ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </>
          )

          return t.href ? (
            <Link
              key={t.key}
              href={t.href}
              aria-haspopup="true"
              aria-expanded={active === t.key}
              aria-controls={panelId}
              className={triggerClass(variant, highlighted)}
              onClick={(e) => {
                e.preventDefault()
                triggerRef.current = e.currentTarget
                if (active === t.key) beginClose()
                else open(t.key)
              }}
            >
              {inner}
            </Link>
          ) : (
            <button
              key={t.key}
              type="button"
              aria-haspopup="true"
              aria-expanded={active === t.key}
              aria-controls={panelId}
              className={triggerClass(variant, highlighted)}
              onClick={(e) => {
                triggerRef.current = e.currentTarget
                if (active === t.key) beginClose()
                else open(t.key)
              }}
            >
              {inner}
            </button>
          )
        })}
      </nav>

      {activeTrigger && (
        <div
          id={panelId}
          role="region"
          aria-label={activeTrigger.label}
          // z BELOW the bar (the bar is opaque + higher), so the panel tucks UNDER it and
          // slides out from behind its bottom edge. `top-full` pins it to the bar's base. The
          // translate distance is deliberately large so the slide-from-under reads clearly.
          style={{ transitionDuration: `${fadeMs}ms` }}
          className={`absolute inset-x-0 top-full z-20 border-b border-border bg-surface shadow-menu transition-all ease-out motion-reduce:transition-none ${
            shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-8 opacity-0'
          }`}
        >
          {panelAlign === 'content' ? (
            // Reproduce the shell's body grid (centered max-w, the same gap, and rail-width
            // SPACERS) so the visible card lands exactly in the content column between rails.
            // Reproduce the shell's body row from lib/layout/shell-metrics — the SAME strings
            // the shell itself uses, so the card lands in the content column and stays there
            // when a rail folds. Never hand-written here again (see that file's note).
            <div className={`flex ${SHELL_ROW_CLASS} ${SHELL_ROW_GAP_CLASS}`}>
              <div
                className={`hidden shrink-0 md:block ${leftFolded ? RAIL_STRIP_CLASS : LEFT_RAIL_CLASS}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1 py-6">
                {panelHeader && <div className="mb-6">{panelHeader}</div>}
                {panelBody}
              </div>
              {rightRail && (
                <div
                  className={`hidden shrink-0 lg:block ${RIGHT_RAIL_ML_CLASS} ${
                    rightFolded ? RAIL_STRIP_CLASS : RIGHT_RAIL_CLASS
                  }`}
                  aria-hidden
                />
              )}
            </div>
          ) : (
            <div className={`flex py-6 ${SHELL_ROW_CLASS}`}>{panelBody}</div>
          )}
        </div>
      )}
    </div>
  )
}
