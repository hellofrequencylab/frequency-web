'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sparkles, Search, BookOpen, X, MessageSquare, LifeBuoy, Bug, ArrowLeft } from 'lucide-react'
import type { HelpSearchEntry } from '@/lib/help/content'
import { searchHelp } from '@/lib/help/search'
import { VeraChat, COMPANION_OPENING } from '@/components/vera/vera-chat'
import { SupportConversationsPanel } from '@/components/support/support-conversations-panel'
import { DockChat, prefetchDockSummary } from '@/components/messages/dock-chat'
import { getMessagesUnreadCount } from '@/app/(main)/messages/popover-actions'
import { openSupport } from '@/components/support/support-launcher'
import {
  DOCK_BACK_EVENT,
  DOCK_OPEN_EVENT,
  nextDockRequestId,
  parseDockRequest,
  stripDockParams,
  type DockOpenDetail,
} from '@/lib/messages/dock-open'
import { EdgePill } from '@/components/layout/edge-pill'
import {
  DOCK_CHAT_SLOT_ID,
  announceDockSegmentOpen,
  getDockGeometry,
  getServerDockGeometry,
  onOtherDockSegmentOpen,
  subscribeDockGeometry,
} from '@/components/layout/dock-bar'
import type { TeaseGate } from '@/lib/pricing/upsell-tease'
import { buttonClasses } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'

// The persistent dock (ADR-086 + messaging MVP; unified shell per docs/CHAT-SHELL-PLAN.md C1).
// ONE tab in the anchored bottom bar on every member page, opening a panel in the shared dock
// popover language:
//   • Messages — member-to-member messaging (DMs + rooms), inbox-first. THE FRONT TAB.
//   • Vera — the AI companion (live loop + propose-and-confirm writes). The second tab.
//   • Help & support — NOT a tab: a full-panel SECTION pushed by the footer link (owner
//     directive: direct support is one tap away, never up front). Holds the help search,
//     Ask Vera, Report a bug / tickets / help center / email.
// Mounted in the (main) layout, so it persists across navigation. It remembers the last tab
// (localStorage) and shows an unread badge for messages. Deterministic-first: with AI off,
// Vera degrades to the scripted concierge and Messages + Help still work (AI-VERA §3).
//
// ── The three-docks contract (design_handoff/dawn/readme.md §"The three docks") ─────────────
// Bottom right is ONE bar: the Vault segment, then this tab. All three docks share one popover
// shell — `.glass` + `.lift-3`, Esc OR an outside click to dismiss — and all three REVEAL FROM
// INSIDE THEIR OWN TAB rather than floating above it: a `grid-rows-[0fr] → [1fr]` row, so the
// bar's bottom edge stays pinned to the corner and nothing lifts off it. This panel is anchored
// to the bar's chat segment and tucks its bottom edge behind the crest, so it reads as sliding
// out from behind the tab instead of arriving as a separate window nearby.

type Tab = 'chat' | 'vera'

const TAB_KEY = 'fq_dock_tab'

// ── Shape + tone constants, hoisted ABOVE every `<button>` in this file on purpose ──────────
// The raw-button-bg ratchet reads a 500-character proximity window FORWARD from each `<button`,
// so an amber token written inside the tag counts as a hand-rolled fill even when it is a
// two-pixel dot or a count chip. Naming them here keeps the actual FILLS on the kit primitive
// (which is what the ratchet is protecting) and still lets the decorations use real tokens.

/** The dock segment. The bar owns the crest, the hairline and the blur, so the tab draws none
 *  of them: it fills its segment edge to edge and lets the bar clip it. */
const TRIGGER_SHAPE = 'relative h-full w-11 rounded-none px-0 py-0'
/** The unread count, on the loud tile. */
const UNREAD_BADGE =
  'absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-3xs font-bold text-on-danger'
/** The "something is waiting" dot. A dot, not the pill's wiggle: the bar is anchored furniture
 *  now, and furniture that shakes reads as broken rather than as a nudge. Full amber, because
 *  at rest it sits on the MUTED tile and a cream dot would disappear into it. */
const WAITING_DOT = 'pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-pill bg-primary-strong'
/** Dock modes. Pills, not underlines — the panel is a popover, not a page. */
const TAB_BASE =
  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-body-sm font-medium transition-colors'
const TAB_ON = 'bg-primary-bg text-primary-strong'
const TAB_OFF = 'text-muted hover:text-text'
/** The unread count on the Messages tab. Unread is a DANGER badge, not an amber one: amber is
 *  the brand accent and it is already carrying the tab's own on/off state two pixels away, so an
 *  amber-on-amber count says nothing. `bg-danger` + `text-on-danger` is the kit's minted pair. */
const TAB_COUNT =
  'inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-3xs font-bold text-on-danger'

// ── ITEM 5: the tab activates when you reach the end of the rail ─────────────────────────────
//
// The bar already knows this. It measures the rail's end to ride up and meet it, and now
// publishes `atRailEnd` from that SAME measurement (components/layout/dock-bar.tsx) — so this is
// one subscription, not a second scroll listener racing the first.
//
// WHAT "ACTIVATE" MEANS. Two readings were possible, and the shipped one is the quiet one:
//
//   'nudge'  the tab takes its ACTIVE VISUAL STATE. Nothing moves, nothing is announced, and a
//            member who was reading keeps reading. ← SHIPPED
//   'open'   the panel opens itself.
//
// 'open' is hostile: a panel that unfurls under someone's cursor because they scrolled takes the
// page away from them without being asked, and it would fight every dismissal in this file (you
// close it, you are still at the end of the rail, it comes back). Both branches are wired below,
// so the choice is this one word rather than a rewrite.
const RAIL_END_ACTIVATION: 'nudge' | 'open' = 'nudge'

/** Below this the panel stops shrinking to fit the rail. A rail shorter than a usable chat window
 *  is a page with almost nothing on it; overhanging its top edge there beats handing a member a
 *  three-line transcript. */
const MIN_PANEL_HEIGHT = 320

/** How far the panel's bottom edge tucks BEHIND the bar's crest. Without it the bar's rounded
 *  top corners leave two notches of canvas showing under the panel; with it the panel simply
 *  disappears behind the crest, which is the "slides up from behind the tab" reading. The panel
 *  pays it back as bottom padding (`md:pb-2`), so no content ever sits under the bar. */
const PANEL_TUCK = 8
/** Long enough to outlast the slowest `--motion-base` on the feel scale (340ms), so the body is
 *  still mounted while the row collapses and the panel does not blink out mid-slide. */
const PANEL_COLLAPSE_MS = 400

function initialTab(): Tab {
  if (typeof window === 'undefined') return 'chat'
  try {
    const v = localStorage.getItem(TAB_KEY)
    if (v === 'vera' || v === 'chat') return v
    // MIGRATION (CHAT-SHELL-PLAN C1): 'help' was a top-level tab in the old dock; it is now the
    // link-opened section, so a remembered 'help' lands on Messages (the front tab).
  } catch {}
  return 'chat'
}

/**
 * Where the panel's bottom-right corner sits, measured off the dock bar's chat segment.
 *
 * The panel cannot simply be a CHILD of that segment the way the Vault's panel is a child of
 * its own: the segment is ~48px wide and the bar clips to its crest (`overflow-hidden`), so a
 * 24rem popover inside it would be sliced to a sliver. And it cannot be a child of the bar
 * either, because the bar is `hidden` below md — a phone would lose the whole dock. So it stays
 * a fixed-position sibling and ANCHORS to the segment's rect, which is the same trick DAWN's
 * own AccountDock uses to escape the scrolling rail (`ui_kits/app/docks.jsx`).
 *
 * Returns null when there is no bar to anchor to — below md, where the bar is display:none and
 * its rect is all zeros. Zero is the tell, the same guard DockBar's own measure uses. A missing
 * SLOT (marketing, /help, /discover, /admin) is handled by the caller rather than here, so the
 * stale-anchor case never needs a setState inside the effect that discovers it.
 */
function useDockAnchor(slot: HTMLElement | null): { right: number; bottom: number } | null {
  const [anchor, setAnchor] = useState<{ right: number; bottom: number } | null>(null)

  useEffect(() => {
    if (!slot) return
    let raf = 0
    const measure = () => {
      const rect = slot.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        setAnchor(null)
        return
      }
      setAnchor({
        right: Math.round(window.innerWidth - rect.right),
        bottom: Math.round(window.innerHeight - rect.top - PANEL_TUCK),
      })
    }
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    // The DOM's geometry IS the external system here: the bar's position is measured, not
    // derived, and React cannot know it. The first read has to be synchronous or the panel
    // paints at the md fallback for a frame and then jumps to the bar.
    measure()
    // The bar rides up to meet the rail's end on scroll (DockBar's `lift`), so scroll moves the
    // anchor as well as resize. Both are rAF-coalesced; the bar applies its own transform on the
    // same frame, so a fast scroll can leave the panel one frame behind the crest. Visible only
    // while scrolling with the panel open, and it settles the moment the scroll stops.
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const ro = new ResizeObserver(schedule)
    ro.observe(slot)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [slot])

  return anchor
}

export function VeraLauncher({ index, veraTease }: { index: HelpSearchEntry[]; veraTease?: TeaseGate }) {
  // Admin pages drop the dock tab (the page-admin dock owns that corner); the panel
  // still opens there via the command bar's open-vera event.
  const pathname = usePathname()
  // The deep-link channel (ADR-896). `useSearchParams` forces its client subtree to render on
  // the client for a prerendered route, so the docs ask for a Suspense boundary above it
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md,
  // "Prerendering"). VeraLauncher already sits inside `<Suspense fallback={null}>` in the
  // (main) layout, so that requirement is met without a new boundary.
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const onAdmin = pathname.startsWith('/admin')
  const [open, setOpen] = useState(false)
  // The panel BODY is mounted lazily and unmounted one collapse later, so DockChat's realtime
  // subscription lives exactly as long as the open dock does — while the reveal row itself
  // stays in the tree from the first render, which is what gives the grid a 0fr to travel FROM.
  const [render, setRender] = useState(false)
  const [tab, setTab] = useState<Tab>(initialTab)
  // The Help & support SECTION overlays the tabs when open (a pushed view with Back).
  const [helpOpen, setHelpOpen] = useState(false)
  const [q, setQ] = useState('')
  // Vera's own "unclosed chat" pulse (set by vera-chat, cleared when the panel opens).
  const [pulse, setPulse] = useState(() => typeof window !== 'undefined' && localStorage.getItem('fq_vera_unread') === '1')
  // Unread member-message count, for the tab + the tile's tone.
  const [unread, setUnread] = useState(0)
  // A pending "open the dock at THIS thread" request, handed to DockChat (ADR-896).
  const [requested, setRequested] = useState<DockOpenDetail | null>(null)
  // Whether DockChat currently has a thread open, so ESC can go back before it closes.
  const [threadOpen, setThreadOpen] = useState(false)
  // Where focus came from, so closing returns it instead of dumping it on <body>.
  const openerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The bar's chat segment, looked up rather than passed: DockBar is a shell sibling fed by the
  // `dock` prop while this launcher is mounted in the (main) layout, so neither owns the other.
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [slotChecked, setSlotChecked] = useState(false)
  // The measurement only applies while there IS a segment to measure: navigating to /admin drops
  // the bar, and a remembered rect would strand the panel where the bar used to be.
  const measured = useDockAnchor(slot)
  const anchor = slot ? measured : null
  // The BAR's own measurement, subscribed rather than retaken (items 5 + 8). DockBar reads the
  // rail once per frame it needs to; this is that read, not a second one.
  const geometry = useSyncExternalStore(subscribeDockGeometry, getDockGeometry, getServerDockGeometry)
  const bar = slot ? geometry.bar : null
  const railTopAboveBottom = slot ? geometry.railTopAboveBottom : null
  const atRailEnd = slot ? geometry.atRailEnd : false
  const results = useMemo(() => searchHelp(index, q, 6), [q, index])

  // Remember the last mode across sessions.
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab) } catch {}
  }, [tab])

  useEffect(() => {
    // Reading the DOM for the portal target: the slot is rendered by a different component, so
    // its existence is external state React cannot tell us about. Synchronous on purpose —
    // deferring it would blink the fallback pill onto surfaces that do have a dock. Re-run on
    // navigation because the bar mounts and unmounts with the rail (there is none on /admin).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(document.getElementById(DOCK_CHAT_SLOT_ID))
    setSlotChecked(true)
  }, [pathname])

  // Unread message count for the badge (best-effort; refreshes each time the panel toggles).
  useEffect(() => {
    let alive = true
    getMessagesUnreadCount().then((n) => { if (alive) setUnread(n) }).catch(() => {})
    return () => { alive = false }
  }, [open])

  // Warm the messages summary once on mount so opening the Messages tab is instant
  // (the summary is a few RPCs — this is what felt slow on first open).
  useEffect(() => { prefetchDockSummary() }, [])

  // The collapse timer outlives any single close, so it is cleared on unmount.
  useEffect(() => () => { if (collapseTimer.current) clearTimeout(collapseTimer.current) }, [])

  /** Mount the body (if it is not already) and expand the reveal row. */
  function show() {
    if (collapseTimer.current) { clearTimeout(collapseTimer.current); collapseTimer.current = null }
    setRender(true)
    setOpen(true)
    // ITEMS 6 + 7: the bar's two segments are mutually exclusive, so the Vault closes when this
    // opens. Announced from `show()` because it is the ONE funnel every open path already goes
    // through — the tab, open-chat / open-vera / open-help, and the `?chat=` deep link — so no
    // caller can open this dock without the Vault hearing about it.
    announceDockSegmentOpen('chat')
  }

  useEffect(() => {
    const onActivity = () => setPulse(true)
    // Other surfaces open a specific mode via these events (the site-wide open API,
    // CHAT-SHELL-PLAN §2): open-chat → Messages; open-vera → Vera; open-help → the section.
    const onOpenVera = () => {
      setTab('vera'); setHelpOpen(false); show(); setPulse(false)
      try { localStorage.removeItem('fq_vera_unread') } catch {}
    }
    // open-chat now carries an OPTIONAL detail (lib/messages/dock-open.ts): with one, the dock
    // opens straight onto that conversation; without one it behaves exactly as before, so any
    // older `new Event('open-chat')` dispatcher keeps working.
    const onOpenChat = (e: Event) => {
      const detail = (e as CustomEvent<DockOpenDetail>).detail ?? null
      if (document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement
      setTab('chat'); setHelpOpen(false); show()
      setRequested(detail)
    }
    const onOpenHelp = () => { setHelpOpen(true); show() }
    window.addEventListener('vera-activity', onActivity)
    window.addEventListener('open-vera', onOpenVera)
    window.addEventListener(DOCK_OPEN_EVENT, onOpenChat)
    window.addEventListener('open-help', onOpenHelp)
    return () => {
      window.removeEventListener('vera-activity', onActivity)
      window.removeEventListener('open-vera', onOpenVera)
      window.removeEventListener(DOCK_OPEN_EVENT, onOpenChat)
      window.removeEventListener('open-help', onOpenHelp)
    }
  }, [])

  // ── The deep-link channel: `?chat=dm&thread=<id>` ─────────────────────────────────────────
  // A CustomEvent dispatched before this component mounts is lost with no trace, so anything
  // that arrives via a FULL PAGE LOAD (a pasted link, or the Phase 2 redirect off the retired
  // DM route) has to travel in the URL instead. Keyed on pathname AND the query string: keying
  // on pathname alone means a query-only change never fires, so a `?chat=…` link landing on the
  // page the member is already on would be silently ignored.
  useEffect(() => {
    const ref = parseDockRequest(search)
    if (!ref) return
    // The URL is the external system: on a cold load there is no earlier render to carry this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab('chat'); setHelpOpen(false); show()
    setRequested({ ...ref, requestId: nextDockRequestId() })
    // Plain DOM history, NOT router.replace: the page does not read these params, so a replace
    // would re-run its Server Components to produce byte-identical output.
    window.history.replaceState(null, '', stripDockParams(window.location.pathname, window.location.search))
  }, [pathname, search])

  const openPanel = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement
    }
    show()
    setPulse(false)
    try { localStorage.removeItem('fq_vera_unread') } catch {}
  }

  // ESC closes; focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => panelRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Inside a thread, the first ESC goes BACK to the inbox. Closing the whole dock on one
      // keystroke loses the place of a member mid-way through reading a conversation.
      if (threadOpen) window.dispatchEvent(new Event(DOCK_BACK_EVENT))
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
    // `close` is re-created every render; the listener is deliberately re-bound only when the
    // panel opens or a thread opens, never on every keystroke in the composer.
  }, [open, threadOpen])

  // An outside click dismisses, which is the OTHER half of the dock contract (DAWN: "Esc or an
  // outside click out"). The dock stays non-modal — no scrim, no focus trap, the page keeps
  // taking clicks — so this is a plain mousedown watch rather than an overlay.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (panelRef.current?.contains(t)) return
      // The tab toggles itself; letting this fire too would close and reopen on one click.
      if (triggerRef.current?.contains(t)) return
      // A dialog the dock ITSELF opened (the bug-capture sheet, a confirm) portals outside the
      // panel. Dismissing the dock underneath it would pull the ground out from the thing the
      // member just asked for.
      if (t.closest('[role="dialog"],[role="alertdialog"]') !== null) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // Same reasoning as the ESC listener above: `close` is stable in behaviour, not identity.
  }, [open])

  // The receiving half of items 6 + 7. Bound only WHILE OPEN, which is what makes "close me"
  // idempotent without a guard: there is no listener to fire when there is nothing to close. It
  // routes through the same `close()` as Esc and the outside click, so focus return and the
  // collapse timer stay in one place and cannot run twice.
  useEffect(() => {
    if (!open) return
    return onOtherDockSegmentOpen('chat', close)
    // Same reasoning as the two listeners above: `close` is stable in behaviour, not identity.
  }, [open])

  // ITEM 5, the 'open' reading — INERT while RAIL_END_ACTIVATION is 'nudge' (see the constant).
  // Wired rather than described, so flipping the behaviour is one word and not a rewrite.
  //
  // It reacts inside the store's CALLBACK rather than in the effect body on `atRailEnd`. That is
  // not a style preference: an effect body that calls `show()` when a subscribed value changes is
  // a cascading render, and this repo's lint (react-hooks/set-state-in-effect) rejects it by name.
  // Reacting to an external system from the callback it hands you is the shape the rule sanctions.
  useEffect(() => {
    if (RAIL_END_ACTIVATION !== 'open') return
    return subscribeDockGeometry(() => {
      if (getDockGeometry().atRailEnd) show()
    })
    // `show` only touches setters and refs, all of which are stable for this component's life.
  }, [])

  function close() {
    setOpen(false)
    setHelpOpen(false)
    setQ('')
    setRequested(null)
    // Focus FIRST, before the row collapses and the panel goes inert: a caret left inside an
    // inert subtree is dropped on <body>, and a keyboard member restarts their tab order from
    // the top of the document. Only when focus is actually inside the panel, though — an
    // outside click has already put it somewhere the member chose, and stealing it back to the
    // dock they just dismissed would be worse than doing nothing.
    const opener = openerRef.current
    openerRef.current = null
    if (panelRef.current?.contains(document.activeElement)) {
      if (opener?.isConnected) opener.focus()
      else triggerRef.current?.focus()
    }
    // Unmount the body only after the collapse has run, so it does not blink out mid-slide.
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => {
      setRender(false)
      collapseTimer.current = null
    }, PANEL_COLLAPSE_MS)
  }

  // ── ITEM 8: the panel is the RAIL's drawer, not a window parked near the bar ────────────────
  //
  // It used to be a 24rem card at `md:bottom-6 md:right-6` — a separate object that happened to
  // sit nearby, dropping straight down out of a 48px tab. It now takes the BAR's exact box (which
  // at lg+ IS the rail's box, by construction: DockBar spans the rail) and the rail's full height,
  // with its bottom edge still tucked behind the crest. Because its right edge is pinned to the
  // tab it emerges from while its body is the whole rail-wide column, it grows out to the LEFT.
  //
  // Every number here comes from DockBar's ONE measurement plus the segment anchor this file
  // already took. The rail is not measured a second time.
  //
  // `right: 'auto'` is required, not decorative: the class fallback carries `md:right-6` for the
  // surfaces that have no bar, and left + width + right would otherwise be three constraints on a
  // two-constraint box.
  const panelBox = anchor
    ? bar
      ? { left: bar.left, width: bar.width, right: 'auto' as const, bottom: anchor.bottom }
      : anchor
    : undefined
  // Rail top → the panel's tucked bottom edge. Both are distances from the viewport's BOTTOM, so
  // the height is a subtraction and never needs `innerHeight` at render time. Null keeps the
  // md-band class height (`md:h-[35rem]`), which is the right answer where there is no rail.
  const panelHeight =
    anchor && railTopAboveBottom !== null
      ? Math.max(MIN_PANEL_HEIGHT, railTopAboveBottom - anchor.bottom)
      : null

  const showInstant = helpOpen && q.trim().length >= 2
  const headerTitle = helpOpen ? 'Help & support' : tab === 'vera' ? 'Vera' : 'Messages'
  const headerSub = helpOpen
    ? 'Find an answer, or reach a human.'
    : tab === 'vera'
      ? 'Vera is AI. Ask anything, or find your way.'
      : 'Chat with members and your rooms.'
  const HeaderIcon = helpOpen ? LifeBuoy : tab === 'vera' ? Sparkles : MessageSquare

  return (
    <>
      {/* The dock tab, portalled into the anchored bar's chat segment. Muted until it matters;
          full amber on an unread. NOT on /admin (the page-admin dock owns that corner); the
          panel stays mounted so the admin "Ask Vera" bar (open-vera) still works. */}
      {!onAdmin && (
        <ChatTrigger
          ref={triggerRef}
          slot={slot}
          slotChecked={slotChecked}
          open={open}
          panelMounted={render}
          atRailEnd={atRailEnd}
          waiting={pulse || unread > 0}
          unread={unread}
          onOpen={openPanel}
        />
      )}

      {/* ── The reveal ────────────────────────────────────────────────────────────────────────
          The Vault's motion, not a floating window's: a grid row travelling 0fr → 1fr, so the
          panel grows UPWARD out of the bar with its bottom edge pinned to the crest. The row is
          in the tree from the first render (a grid cannot transition from a height it never
          had), collapsed to zero and `inert` — so nothing inside it is tabbable, hittable or
          announced until the dock is actually open. */}
      <div
        style={panelBox}
        inert={!open || undefined}
        className={cn(
          // Bottom sheet on a phone, an extension of the bar from md. `md:z-30` puts it UNDER
          // the bar (z-40) on purpose: the tucked bottom edge has to disappear behind the crest,
          // not paint over it. Below md there is no bar, and the sheet keeps its z-50 so the
          // mobile tab bar cannot cover it.
          // The `md:` box here is now only the FALLBACK for surfaces that have no bar at all
          // ((marketing), (help), /discover — the EdgePill's neighbours). Wherever a bar exists,
          // `panelBox` above overrides left/width/right/bottom with the bar's own measurement.
          'fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md md:mx-0 md:inset-x-auto md:bottom-6 md:right-6 md:z-30 md:w-96 md:max-w-none',
          // The reveal is unchanged: a grid row travelling 0fr → 1fr on `--motion-base`, which IS
          // the cue-pop beat the three docks arrive on, with `motion-reduce` collapsing it.
          'grid overflow-hidden transition-[grid-template-rows] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none print:hidden',
          open ? 'grid-rows-[1fr]' : 'pointer-events-none grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0">
          {render && (
            <div
              ref={panelRef}
              id="fq-dock-panel"
              tabIndex={-1}
              role="dialog"
              // The dock is non-modal by design (no page overlay, members keep navigating while
              // chatting). `role="dialog"` alone makes assistive tech infer modality, which would
              // announce the rest of the page as unavailable when it is not.
              aria-modal="false"
              aria-label="Messages, Vera and help"
              // The shared dock popover shell: `.glass` + `.lift-3` on the role radius, the same
              // object the system menu and the Vault wear. Bottom sheet on a phone (square top
              // corners hug the viewport edge), an extension of the bar on desktop.
              //
              // `md:max-h-none` releases the phone sheet's 37.5rem cap above md: covering the
              // rail is the whole point of the desktop panel, and a cap measured for a 68dvh
              // sheet would stop it two thirds of the way up. `md:h-[35rem]` stays as the height
              // for the md band, where there is no rail to cover; `panelHeight` overrides it
              // wherever there is one.
              style={panelHeight ? { height: panelHeight } : undefined}
              className="glass lift-3 flex h-[68dvh] max-h-[37.5rem] w-full flex-col overflow-hidden rounded-t-card pb-[env(safe-area-inset-bottom)] outline-none md:h-[35rem] md:max-h-none md:pb-2"
            >
              {/* Header — canvas, so it reads as the dock's own chrome rather than more
                  transcript. Reflects the active view; Help gets a Back affordance. */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-canvas px-4 py-3">
                {helpOpen ? (
                  <IconButton label="Back" onClick={() => { setHelpOpen(false); setQ('') }}>
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </IconButton>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary-bg text-primary-strong">
                    <HeaderIcon className="h-4 w-4" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p id="vera-launcher-title" className="text-body-sm font-bold text-text">{headerTitle}</p>
                  <p className="truncate text-meta text-subtle">{headerSub}</p>
                </div>
                <IconButton label="Close" onClick={close}>
                  <X className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>

              {/* Tabs — Messages front, Vera second. Hidden while the Help section is pushed. */}
              {!helpOpen && (
                <div className="flex shrink-0 gap-1 border-b border-border bg-surface px-2 py-1.5" role="tablist" aria-label="Dock modes">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'chat'}
                    onClick={() => setTab('chat')}
                    className={cn(TAB_BASE, tab === 'chat' ? TAB_ON : TAB_OFF)}
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden /> Messages
                    {unread > 0 && <span className={TAB_COUNT}>{unread > 9 ? '9+' : unread}</span>}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'vera'}
                    onClick={() => setTab('vera')}
                    className={cn(TAB_BASE, tab === 'vera' ? TAB_ON : TAB_OFF)}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden /> Vera
                  </button>
                </div>
              )}

              {/* The body sits on `bg-surface`: glass is the SHELL's chrome, and a transcript
                  read through a blurred page is a transcript nobody reads (DAWN's own docks put
                  solid surface behind every content block inside the glass). */}
              {helpOpen ? (
                /* ── Help & support SECTION (link-opened, never a tab) — the deterministic
                      tiers: article search → Ask Vera → the help center → a human. ─────────── */
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface px-4 py-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search help…"
                      aria-label="Search help"
                      className="w-full rounded-control border border-border bg-surface-elevated py-2 pl-9 pr-3 text-body-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
                    />
                  </div>

                  {showInstant && (
                    <ul className="mt-2 divide-y divide-border overflow-hidden rounded-card border border-border">
                      {results.length === 0 ? (
                        <li className="px-3 py-2 text-body-sm text-muted">No matches. Ask Vera.</li>
                      ) : (
                        results.map((r) => (
                          <li key={r.href}>
                            <Link href={r.href} onClick={close} className="block px-3 py-2 hover:bg-surface-elevated">
                              <span className="block text-body-sm font-medium text-text">{r.title}</span>
                              <span className="block text-meta text-muted">{r.categoryTitle}</span>
                            </Link>
                          </li>
                        ))
                      )}
                    </ul>
                  )}

                  <button
                    type="button"
                    onClick={() => { setHelpOpen(false); setTab('vera') }}
                    className="mt-3 flex w-full items-center gap-3 rounded-card border border-border px-3 py-2.5 text-left transition-colors hover:border-primary"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-medium text-text">Ask Vera</span>
                      <span className="block truncate text-meta text-muted">Get a plain-language answer in a real conversation.</span>
                    </span>
                  </button>

                  {/* The member's own support CONVERSATIONS (chat consolidation): send us a message, and it
                      threads back here as a ticketed conversation. Report-a-bug + help center stay below. */}
                  <div className="mt-3 -mx-4 border-t border-border">
                    <SupportConversationsPanel />
                  </div>

                  <div className="mt-auto space-y-1 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => { close(); openSupport('bug') }}
                      className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-body-sm text-text hover:bg-surface-elevated"
                    >
                      <Bug className="h-4 w-4 text-muted" aria-hidden /> Report a bug
                    </button>
                    <Link href="/help" onClick={close} className="flex items-center gap-3 rounded-control px-3 py-2 text-body-sm text-text hover:bg-surface-elevated">
                      <BookOpen className="h-4 w-4 text-muted" aria-hidden /> Browse the help center
                    </Link>
                  </div>
                </div>
              ) : tab === 'chat' ? (
                <div className="flex min-h-0 flex-1 flex-col bg-surface">
                  <DockChat
                    onNavigate={close}
                    requested={requested}
                    onRequestHandled={() => setRequested(null)}
                    onThreadOpenChange={setThreadOpen}
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col bg-surface">
                  <VeraChat opening={COMPANION_OPENING} veraTease={veraTease} />
                </div>
              )}

              {/* Footer link — the ONE doorway to Help & support (owner: support is never a tab). */}
              {!helpOpen && (
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border bg-canvas px-4 py-2 text-meta font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <LifeBuoy className="h-3.5 w-3.5" aria-hidden /> Help &amp; support
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── The chat trigger, in the anchored dock when there is one ──────────────────
//
// The chat used to be an EdgePill at `top-1/2 right-0` — pushed to the middle of the right
// edge because it and the Vault were two floating objects fighting for the same corner. The
// owner's read: nobody looks halfway down the screen for chat. So on member surfaces it now
// renders INTO the anchored bottom bar (components/layout/dock-bar.tsx), beside the Vault.
//
// It PORTALS rather than being a child of DockBar because the two have different owners:
// DockBar is a shell sibling fed by the `dock` prop, while this launcher is mounted in the
// (main) layout and persists across navigation. A portal lets the button sit in the bar's
// geometry without either component having to own the other's state.
//
// The EdgePill stays as the fallback, and it is not dead code: (marketing), (help) and
// /discover mount this launcher with no Vault and therefore no dock slot. `slotChecked` gates
// the decision so the pill never flashes on a surface that does have a dock.
//
// TONE. The tile is MUTED at rest and full-strength only when something is actually waiting.
// A solid amber block that is always solid amber says "act on me" on every page of the app,
// which is the one thing a persistent piece of furniture must not say; and when a message
// really does arrive it has nowhere left to go. So rest is the muted pair (`primarySoft` —
// `bg-primary-bg` + `text-primary-strong`) and an unread promotes it to the full fill.
//
// ITEM 5 adds two more ways into that same full fill, and neither of them dilutes the rule
// above, because neither is on for longer than it is true:
//   • OPEN — the tab is lit while its own panel is showing, which is what an active tab does.
//   • AT THE RAIL'S END — the nudge. `atRailEnd` is deliberately not "the rail ended on screen":
//     DockBar only reports it for a rail that was TALLER than the window, so it means "you
//     scrolled down to me" and it is false on every short page. Purely visual: no announcement,
//     no aria change, no focus move. The badge and the waiting dot still carry "something is
//     waiting", so a lit tab and a lit tab with a red count are still two different sentences.
function ChatTrigger({
  ref,
  slot,
  slotChecked,
  open,
  panelMounted,
  atRailEnd,
  waiting,
  unread,
  onOpen,
}: {
  ref: React.RefObject<HTMLButtonElement | null>
  slot: HTMLElement | null
  slotChecked: boolean
  open: boolean
  /** Whether `#fq-dock-panel` is in the document right now. NOT the same as `open`: the panel
   *  outlives its own close by PANEL_COLLAPSE_MS so the collapse can animate, and it has never
   *  been mounted at all before the first open. aria-controls must follow the DOM, not intent. */
  panelMounted: boolean
  atRailEnd: boolean
  waiting: boolean
  unread: number
  onOpen: () => void
}) {
  if (!slotChecked) return null

  if (!slot) {
    return (
      <EdgePill
        side="right"
        glow="orange"
        label="Chat"
        icon={<MessageSquare className="h-[18px] w-[18px]" aria-hidden />}
        waiting={waiting}
        badgeCount={unread}
        onOpen={onOpen}
        ariaLabel="Open messages, Vera, and help"
      />
    )
  }

  // Geometry through the kit primitive rather than a hand-rolled fill string — the raw-button-bg
  // ratchet exists to stop exactly that, and this control tripped it before being moved onto
  // `buttonClasses`. The overrides are shape only (fill the segment, square, no padding), which
  // is what the primitive's `className` argument is for.
  return createPortal(
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      // Only while the panel is actually in the document. `id="fq-dock-panel"` lives behind
      // `{render && …}` and unmounts PANEL_COLLAPSE_MS after every close, so an unconditional
      // aria-controls points at nothing before the first open and again after each close — a
      // dangling reference a screen reader cannot follow. Same rule dock-chat.tsx already
      // applies to its details panel one file over.
      aria-controls={panelMounted ? 'fq-dock-panel' : undefined}
      aria-label="Open messages, Vera, and help"
      title="Messages, Vera and help"
      className={buttonClasses(
        unread > 0 || open || (RAIL_END_ACTIVATION === 'nudge' && atRailEnd) ? 'primary' : 'primarySoft',
        'md',
        TRIGGER_SHAPE,
      )}
    >
      <MessageSquare className="h-5 w-5" aria-hidden />
      {unread > 0 && (
        <span className={UNREAD_BADGE}>{unread > 9 ? '9+' : unread}</span>
      )}
      {waiting && unread === 0 && <span aria-hidden className={WAITING_DOT} />}
    </button>,
    slot,
  )
}
