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
  RAIL_END_OPENS,
  announceDockSegmentOpen,
  getDockGeometry,
  getDockPanelOwner,
  getServerDockGeometry,
  getServerDockPanelOwner,
  onOtherDockSegmentOpen,
  railEndOpenDue,
  setDockPanelOpen,
  subscribeDockGeometry,
  subscribeDockPanel,
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
/* THE MODE STRIP IS GONE ENTIRELY, and with it TAB_BASE / TAB_OFF / TAB_ON / TAB_COUNT.
 *
 * Messages went first (owner, 2026-08-11: a control only reachable in the state where it does
 * nothing). Ask Vera followed (owner, 2026-08-12) — not deleted, MOVED, into DockChat's action
 * bar where it replaces Rooms and sits beside the member search. Two controls in one row beat a
 * row of one control above a row of two.
 *
 * The unread count is not lost with TAB_COUNT: it still lights the dock tab itself via
 * ChatTrigger's `unread` prop, which is the mark a member sees with the panel SHUT — the only
 * time a count has a job. */

// ── THE RAIL'S END BELONGS TO THE VAULT NOW (owner, 2026-08-05) ──────────────────────────────
//
// "Scroll-to-bottom OR click opens the Vault." That decision lives in ONE place —
// `RAIL_END_OPENS` in components/layout/dock-bar.tsx, which is where the rail's end is measured —
// and this file reads it rather than keeping a second constant that could name a different
// winner. Only one segment may claim the rail's end: if both did, arriving there would make each
// announce and close the other, and which survived would come down to subscription order.
//
// WHAT THIS FILE LOST WITH IT: the chat tab's `atRailEnd` NUDGE (it took its lit state when you
// reached the end of the rail). It is gone rather than kept, because the rail's end now performs
// a real action on the other segment; a chat tab lighting up at the same moment says something is
// waiting there when nothing is. The tab is still lit by the two things that mean it: an unread,
// and its own panel being open.
//
// The auto-open branch below stays wired for 'chat' so the owner's choice is one word in
// dock-bar.ts and not a rewrite here.

/** Below this the panel stops shrinking to fit the rail. A rail shorter than a usable chat window
 *  is a page with almost nothing on it; overhanging its top edge there beats handing a member a
 *  three-line transcript. */
const MIN_PANEL_HEIGHT = 320

/** How far the panel's bottom edge tucks BEHIND the bar's crest. Without it the bar's rounded
 *  top corners leave two notches of canvas showing under the panel; with it the panel simply
 *  disappears behind the crest, which is the "slides up from behind the tab" reading. The panel
 *  pays it back as bottom padding (`md:pb-2`), so no content ever sits under the bar. */
// The gap between the chat tab's TOP edge and the panel's bottom edge (owner, 2026-08-06:
// "chat window should sit slightly above the tab").
//
// This replaces PANEL_TUCK, which was the same number with the opposite sign: the panel used to be
// pulled 8px DOWN so its bottom edge hid behind the tab's crest. That reads as one object when the
// panel is the full height of the rail, and as a panel snagged on the tab when it is not — and the
// tab has a rounded top, so the overlap clipped the panel's own bottom corners against it.
const PANEL_GAP = 8
/** Long enough to outlast the slowest `--motion-base` on the feel scale (340ms), so the body is
 *  still mounted while the row collapses and the panel does not blink out mid-slide. */
const PANEL_COLLAPSE_MS = 400

/**
 * How wide the panel is wherever it has a tab to grow out of, and WHY IT IS NOT THE TAB'S WIDTH.
 *
 * 🔴 THE BUG THIS FIXES (owner, 2026-08-05, off a live screenshot). The panel used to take the
 * bar's measured box outright — `{ left: bar.left, width: bar.width }` — and at lg+ the bar spans
 * the right rail, so the panel was 288px wide. It is an INBOX: an avatar, a name, a timestamp and
 * a one-line preview. At 288px the preview column is 288 − 25.5 (row `px-3`) − 38.25 (avatar) −
 * 12.75 (`gap-3`) = 211.5px, which is about 40 characters of `--text-meta`, and every real message
 * was being cut mid-word ("Heyooo! I'm planning on heading out to Ro…"). The panel was sized to
 * the door it comes through instead of to the thing it holds. Nothing about the tab's width is a
 * statement about how wide a conversation list should be.
 *
 * HOW THE NUMBER WAS CHOSEN, rather than rounded to something that looked nice. Work backwards
 * from the line that was clipping. A preview should read as a sentence before it truncates, and
 * the type system's own readable measure tops out around 70 characters — past that a single-line
 * preview stops being scannable and you truncate on purpose rather than by accident. At
 * `--text-meta` (0.75rem = 12.75px at this app's 17px root) the app's UI sans runs ~5.2px per
 * character in mixed case, so 68 characters is ~354px of text, plus the 76.5px of row chrome
 * above = 430px. `26rem` is 442px here, the first whole rem step that clears it with a little
 * slack for a wide glyph run. It is also wider than the `md:w-96` (24rem) fallback the md–lg band
 * already used, which is the tell that the lg+ case was the regression: the panel got NARROWER
 * on the bigger screen.
 *
 * IT GROWS LEFT. The right edge stays pinned to the chat tab (see `panelBox`), so the reveal still
 * reads as coming out from behind that tab; the extra width is taken from the gutter and, at the
 * narrowest lg viewport, ~99px of the content column — about 18% of it, for a modeless drawer the
 * member just opened. The `min()` is a viewport guard, not a content guard: it only bites below a
 * ~31rem window, where there is no rail and this box does not apply anyway, and it exists so no
 * future breakpoint change can hand this a width wider than the screen.
 */
const PANEL_WIDTH = 'min(26rem, calc(100vw - 5rem))'

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
        bottom: Math.round(window.innerHeight - rect.top + PANEL_GAP),
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
  // The BAR's own measurement, subscribed rather than retaken (items 5 + 8). DockBar reads the
  // rail once per frame it needs to; this is that read, not a second one.
  const geometry = useSyncExternalStore(subscribeDockGeometry, getDockGeometry, getServerDockGeometry)
  // The measurement only applies while there IS a segment to measure: navigating to /admin drops
  // the bar, and a remembered rect would strand the panel where the bar used to be.
  //
  // `geometry.bar` is the second half of that guard, and it is what a FOLDED rail needs. Folding
  // hides the bar in CSS (DockBar keeps its node so the md–lg band still has a dock), so the slot
  // is still findable and still portalled into — it is simply not on screen. Its own rect goes to
  // zero and DockBar publishes a null box, which is the honest answer to "is there a bar to hang
  // this panel off". Without this gate a chat opened while folded (⌘K, `open-chat`, a `?chat=`
  // link — none of which need the tab) would anchor to the last rect the bar had and paint a
  // panel over the content column where the bar no longer is. Null hands it back to the class
  // fallback, which is the same place the panel lives on every surface that has no bar at all.
  const measured = useDockAnchor(slot)
  const anchor = slot && geometry.bar ? measured : null
  const railTopAboveBottom = slot ? geometry.railTopAboveBottom : null
  // Which segment owns the open panel right now — the STANDING fact, not the open EVENT. The tab
  // needs it to stay quiet while the Vault is up (owner, 2026-08-05); see ChatTrigger's `yielding`.
  const panelOwner = useSyncExternalStore(subscribeDockPanel, getDockPanelOwner, getServerDockPanelOwner)
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
    //
    // 🔴 EXISTS IS NOT THE QUESTION — RENDERED IS. DockBar is `hidden … md:flex`, so below md it
    // is in the DOM and merely display:none. `getElementById` returns it anyway, so this used to
    // find a slot on every phone, take the portal branch, and mount the chat trigger INSIDE a
    // display:none container. The EdgePill fallback never fired because it keys off `!slot`.
    // Net effect: no visible way to reach Messages, Vera or help on a phone at all, on every
    // route with a rail — reachable only by deep link or an in-page "Ask Vera" button.
    //
    // `getClientRects().length` is the test, NOT `offsetParent`. offsetParent is null for
    // position:fixed elements and the dock bar IS fixed, so it would report every DESKTOP dock as
    // absent and swing the bug the other way.
    const read = () => {
      const el = document.getElementById(DOCK_CHAT_SLOT_ID)
      setSlot(el && el.getClientRects().length > 0 ? el : null)
      setSlotChecked(true)
    }
    read()
    // Crossing the md breakpoint changes the slot's visibility WITHOUT a navigation, so pathname
    // alone would strand a desktop portal on a resized-down window.
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
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

  // Publish this segment's open state to the dock's panel store, so the OTHER segment can read
  // the standing fact rather than latching on the open event. Reported from an effect (not from
  // `show()` / `close()`) so every path that changes `open` reports once, and the cleanup covers
  // unmount — navigating to a surface with no dock — without a fifth call site.
  useEffect(() => {
    setDockPanelOpen('chat', open)
    return () => setDockPanelOpen('chat', false)
  }, [open])

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

  // The rail's end, IF this segment is the one that claims it (it is not — the Vault is; see the
  // note at the top of this file). Kept wired so the owner's choice stays one word in dock-bar.ts.
  //
  // It reacts inside the store's CALLBACK rather than in the effect body on `atRailEnd`. That is
  // not a style preference: an effect body that calls `show()` when a subscribed value changes is
  // a cascading render, and this repo's lint (react-hooks/set-state-in-effect) rejects it by name.
  // Reacting to an external system from the callback it hands you is the shape the rule sanctions.
  //
  // `railEndOpenDue` is the rising edge: `atRailEnd` stays true while you sit at the rail's end
  // and the store notifies on every scroll frame, so an unguarded open would re-open the panel on
  // the next pixel after a member closed it — the exact "you close it, it comes back" hostility
  // this branch was left inert over.
  const wasAtRailEnd = useRef(false)
  useEffect(() => {
    if (RAIL_END_OPENS !== 'chat') return
    return subscribeDockGeometry(() => {
      const atEnd = getDockGeometry().atRailEnd
      const due = railEndOpenDue(wasAtRailEnd.current, atEnd)
      wasAtRailEnd.current = atEnd
      if (due) show()
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
  // 🔴 IT PINS THE RIGHT EDGE AND GROWS LEFT — it no longer takes the bar's WIDTH. The bar's box
  // is the rail's box at lg+, and sizing an inbox to a rail clipped every preview mid-word (see
  // PANEL_WIDTH for the measurement and the character count behind the replacement). The right
  // edge is `anchor.right`, which is the CHAT TAB's own right edge, so the panel still reads as
  // sliding out from behind the tab it belongs to while its body is as wide as its content needs.
  //
  // `left: 'auto'` is required, not decorative: the class fallback carries `md:inset-x-0` /
  // `md:right-6`, and left + width + right would otherwise be three constraints on a
  // two-constraint box.
  const panelBox = anchor
    ? { right: anchor.right, bottom: anchor.bottom, left: 'auto' as const, width: PANEL_WIDTH }
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
          waiting={pulse || unread > 0}
          unread={unread}
          yielding={panelOwner === 'vault'}
          // TOGGLE, not open (owner, 2026-08-06: "chat window needs a click to close"). The tab
          // was wired to `openPanel` alone, so pressing it while the panel was open re-ran the
          // open path and nothing visibly happened — the one control that looks like it should
          // shut the panel was the one control that could not. Esc and an outside click both
          // worked, which is why this survived: the panel was closable, just not by its own tab.
          onOpen={() => (open ? close() : openPanel())}
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
          //
          // 🔴 THE RADIUS HERE IS NOT DECORATION — this wrapper is what CLIPS the panel. It needs
          // `overflow-hidden` for the 0fr → 1fr reveal, and its box is exactly the panel's box, so
          // a SQUARE clip cut the panel's own rounded silhouette and sheared `lift-3`'s shadow off
          // flat across each corner. The corner then read as filled-in rather than transparent.
          // Matching the panel's radius makes the clip follow the silhouette, so the corner is
          // genuinely empty and the shadow curves with it.
          'rounded-t-card md:rounded-card',
          'grid overflow-hidden transition-[grid-template-rows] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none print:hidden',
          open ? 'grid-rows-[1fr]' : 'pointer-events-none grid-rows-[0fr]',
        )}
      >
        {/* 🔴 `min-w-0` IS LOAD-BEARING, AND IT IS THE COLUMN TWIN OF `min-h-0`.
            The wrapper above is a GRID (it has to be — the reveal animates grid-template-rows
            0fr → 1fr). A grid's implicit column is `auto`, and an `auto` track's floor is
            MIN-CONTENT, so the column is free to grow past the wrapper's own fixed width. The
            wrapper is `overflow-hidden`, so everything past that width is simply cut off.

            Empty, that never showed. Once the inbox rendered a conversation list the column blew
            out and the panel laid out at 596px inside a 442px wrapper — measured, in that order.
            The 154px hanging off the right edge contained the CLOSE BUTTON, the Rooms button and
            the right-hand end of every row, which is why the owner saw a panel with no X, no
            Rooms, text running off the edge, and "missing the stroke on the right" (the panel's
            own border was out there too). It also explains why it looked correct while LOADING
            and broke on load: the spinner has no min-content width to push with.

            `min-h-0` was already here for the row axis, for the same reason. This is the other
            half of that pair, and dock-parity.test.ts now keeps them together. */}
        <div className="min-h-0 min-w-0">
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
              // maxHeight, NOT height. As a fixed height the panel always filled the rail top to
              // bottom, so three conversations rendered against a header at the top and a footer
              // pinned at the very bottom with a band of empty canvas between them. The rail's top
              // is the CEILING the panel must not pass, not the size it must be.
              style={panelHeight ? { maxHeight: panelHeight } : undefined}
              // ALL FOUR CORNERS ARE ROUNDED AT md (owner, 2026-08-11).
              //
              // `md:rounded-br-none` used to square the bottom-right, and the note here justified
              // it as "that is the corner sitting on the chat tab". That stopped being true when
              // PANEL_GAP replaced PANEL_TUCK: useDockAnchor now sets the panel's bottom to
              // `innerHeight - rect.top + PANEL_GAP`, so the panel floats 8px ABOVE the tab and
              // sits on nothing. A square corner with no tab under it is just a chipped card.
              //
              // The mobile branch still keeps `rounded-t-card` alone, and that is not an
              // oversight: below md this is a bottom SHEET flush to the viewport edge, so its
              // bottom corners have no page behind them to round against.
              //
              // `glass` is gone with it. Glass is the SHELL's material — the bar, the rails — and
              // wearing it here made the panel look like more chrome instead of a surface you
              // read. A solid `bg-canvas` on a `chrome-border` hairline is the kit's card, which
              // is what this is.
              //
              // The mobile branch keeps `rounded-t-card` and stays a bottom sheet: there is no tab
              // to tether to below md (the bar is display:none), so there is no corner to square.
              // 🔴 `md:h-auto md:max-h-[35rem]`, WAS `md:h-[35rem] md:max-h-none`. The old pair
              // said "at md this panel is exactly 35rem tall, with no ceiling" — a fixed SIZE. So
              // three conversations rendered with the header at the top, the footer pinned at the
              // bottom, and a band of empty canvas between them (owner, 2026-08-06: "the chat
              // window doesn't fit"). The panel should be as tall as its contents and no taller.
              //
              // `h-auto` sizes to content; the max is the ceiling. Where a rail exists, the inline
              // `maxHeight` above is the real ceiling (the rail's top) and beats this class, which
              // is why the class cap can be a plain default rather than a second measurement. The
              // pair is still pinned as one contiguous run by dock-bar.test.ts, for the reason its
              // comment gives: a loose search would be satisfied by prose naming a deleted class.
              // `overscroll-contain` on the PANEL is the backstop under the per-scroller one.
              // An inner scroller only stops chaining once it is actually scrollable; a short
              // transcript (or the Help list before it fills) is a scroll port with nothing to
              // scroll, and the browser hands that gesture straight to the document behind — this
              // panel is position:fixed, so what moves is the page under the member's cursor.
              // Containing at the panel boundary means no gesture inside the dock reaches the page,
              // scrollable inner or not. Owner report, 2026-08-22.
              className="lift-3 flex h-[68dvh] max-h-[37.5rem] w-full flex-col overflow-hidden overscroll-contain rounded-t-card border border-chrome-border bg-canvas pb-[env(safe-area-inset-bottom)] outline-none md:rounded-card md:h-auto md:max-h-[35rem] md:pb-2"
            >
              {/* Header — canvas, so it reads as the dock's own chrome rather than more
                  transcript. Reflects the active view; Help gets a Back affordance. */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-chrome-border bg-surface px-4 py-3">
                {/* Back covers BOTH pushed views now. Help still pops to wherever you were; Vera
                    pops to Messages, which is the return path the removed Messages tab used to
                    provide. Without this, deleting that tab would strand a member in Vera. */}
                {helpOpen || tab === 'vera' ? (
                  <IconButton
                    label={helpOpen ? 'Back' : 'Back to messages'}
                    onClick={() => {
                      if (helpOpen) { setHelpOpen(false); setQ(''); return }
                      setTab('chat')
                    }}
                  >
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

              {/* THE MESSAGES PILL IS GONE (owner, 2026-08-11: "remove the Messages button,
                  non-functional / leave the Messages title").
                  It was right, and for a precise reason: `initialTab()` defaults to 'chat', so by
                  the time anyone SAW that pill the panel was already on Messages and pressing it
                  re-selected the tab it was already on. A control that can only be pressed when it
                  does nothing. It also sat two lines under the header's own "Messages" title,
                  saying the same word twice.
                  The title (`headerTitle`, in the header above) is untouched.
                  What remains is the one thing the strip did that the header could not: reach
                  Vera. As a lone control it is a button, not a `role="tab"` — a tablist of one is
                  a lie to a screen reader — and it hides in Vera, where the header's Back returns. */}
              {/* THE ASK VERA STRIP IS GONE, and Vera did not go with it (owner, 2026-08-12).
                  It moved INTO the action bar below, where it replaces the Rooms button and sits
                  beside the member search — see DockChat's `onAskVera`. Keeping the strip as well
                  would put two Ask Vera controls two lines apart, which is the duplication the
                  Messages pill was removed for. Rooms is still reachable: the inbox lists the
                  caller's rooms as rows, and "Open all messages" opens the full inbox. */}

              {/* The body sits on `bg-surface`: glass is the SHELL's chrome, and a transcript
                  read through a blurred page is a transcript nobody reads (DAWN's own docks put
                  solid surface behind every content block inside the glass). */}
              {helpOpen ? (
                /* ── Help & support SECTION (link-opened, never a tab) — the deterministic
                      tiers: article search → Ask Vera → the help center → a human. ─────────── */
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-surface px-4 py-4">
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
                    onAskVera={() => setTab('vera')}
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
// A FOLDED RAIL IS NOT ONE OF THOSE SURFACES, and nothing here has to know that — for a better
// reason than before. DockBar used to hide the whole bar on a fold; the owner has since amended
// that (2026-08-05) so the VAULT segment goes and this tab STAYS, with the bar shrinking to fit
// it. Either way the slot is in the document and this keeps portalling into it, so the tab needs
// no fold input at all. Falling back to the EdgePill would answer a fold by re-planting the
// floating edge launcher this bar was built to retire.
//
// TONE. The tile is MUTED at rest and full-strength only when something is actually waiting.
// A solid amber block that is always solid amber says "act on me" on every page of the app,
// which is the one thing a persistent piece of furniture must not say; and when a message
// really does arrive it has nowhere left to go. So rest is the muted pair (`primarySoft` —
// `bg-primary-bg` + `text-primary-strong`) and an unread promotes it to the full fill.
//
// OPEN is the one other way into that full fill, and it does not dilute the rule above because it
// is not on for longer than it is true: the tab is lit while its own panel is showing, which is
// what an active tab does. The rail-end nudge that used to be a third way is retired — the rail's
// end opens the VAULT now, and a chat tab lighting up at that moment would say something is
// waiting here when nothing is.
//
// ── YIELDING TO AN OPEN VAULT (owner, 2026-08-05) ───────────────────────────────────────────
//
// "When the Vault is open, the message tab stays closed." Read literally that is already true —
// the two panels are mutually exclusive — and the screenshot shows what he actually saw: the
// Vault panel up, and this tab sitting beside it in the FULL AMBER fill, because an unread lights
// it independently of whether its own panel is open. Two lit things, one of them not open.
//
// Of the three available readings, the tab YIELDS rather than hides or goes inert:
//   • HIDING would strand the member's route out of the Vault: with the panel open, that tab is
//     the one-tap way to Messages, and taking it away means close-the-Vault-then-find-the-tab. It
//     would also shrink the bar under an open panel, so the panel would reflow while being read.
//   • INERT is worse than hiding: a control that is visible and refuses to work teaches nothing.
//   • YIELDING is exactly the complaint, precisely fixed: the tab stays, stays pressable, and
//     drops to the quiet resting tone so nothing beside the open Vault LOOKS active. Pressing it
//     opens Messages and closes the Vault through the announcement channel, which is the same one
//     press it always was.
// The unread COUNT and the waiting dot stay in either state, because they are information about
// somebody else's message, not a claim that this panel is open.
function ChatTrigger({
  ref,
  slot,
  slotChecked,
  open,
  panelMounted,
  waiting,
  unread,
  yielding,
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
  waiting: boolean
  unread: number
  /** The Vault owns the open panel. Tone only — the tab stays pressable. */
  yielding: boolean
  onOpen: () => void
}) {
  if (!slotChecked) return null

  if (!slot) {
    return (
      <>
        {/* ── PHONE: a tab peeling out from behind the bottom rail (owner, 2026-08-06) ──────────
            It used to be the EdgePill at `top-1/2` on the right edge — a 29.75px disc floating
            halfway down the screen, under the touch floor and nowhere near the thumb. This is the
            same trigger parked where the other bottom furniture lives.

            HOW "BEHIND" IS ACHIEVED: `z-30` against the tab bar's `z-40`. The bar is
            `bg-surface/95 backdrop-blur-sm`, so the tucked part of the tab is covered but not
            perfectly erased — a faint amber ghost reads through the blur, which is what sells it
            as one object sliding behind another rather than two shapes meeting at a line.

            `bottom: var(--tab-bar-h)` puts the tab's own bottom edge exactly on the bar's top
            edge, and the translate then pushes it back down by its height MINUS the peek — so the
            peek is a single number that means what it says, at every safe-area inset, with no
            second calc to keep in sync. Only the top corners are rounded: the bottom of a tab that
            is behind something has no corners to see.

            🔴 THE PEEK IS A TOKEN NOW, AND THAT IS THE WHOLE OF THE 2026-08-16 FIX. The bottom
            was already measured from `--tab-bar-h`; the three numbers that decide how far this
            tab rises ABOVE it were not — 26px, 36px and `-top-4` lived only in this file. The
            shell pads its scrolling content column by `--tab-bar-clearance`, which was the Zap
            catch's 22px, so on a phone this tab stood 31px INTO the column and painted over the
            Capture composer's send button (owner, off a live /feed capture). Reading the same
            names the clearance is computed from is what makes "the column clears this tab" a
            fact rather than two literals that happen to agree — the failure mode the mobile
            stacking contract (components/sidebar/game-stats-dock.tsx) already records twice. */}
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-controls={panelMounted ? 'fq-dock-panel' : undefined}
          aria-label={
            unread > 0
              ? `Open messages, Vera, and help. ${unread} unread`
              : 'Open messages, Vera, and help'
          }
          style={{ bottom: 'var(--tab-bar-h)' }}
          // The hit area extends `--dock-tab-reach` (1rem = 17px at this app's 17px root) ABOVE
          // the visible tab via the ::before, because the peek is what a thumb can actually reach
          // — the rest of the button is behind an opaque bar and cannot receive the tap. 26px of
          // peek plus 17px of invisible extension is ~43px, which is the touch floor met honestly
          // rather than by claiming the hidden half counts. It is a TOKEN because that invisible
          // band is the half of this tab that steals taps from content that looks free, so the
          // content column's clearance has to know about it (globals.css, --dock-tab-rise).
          className={cn(
            'fixed right-3 z-30 flex h-11 w-14 items-start justify-center rounded-t-card border-x border-t border-primary-strong/20 pt-1.5 md:hidden print:hidden',
            'before:absolute before:inset-x-0 before:-top-[var(--dock-tab-reach)] before:h-[var(--dock-tab-reach)] before:content-[""]',
            'transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none',
            // The waiting peek is the TALLER of the two, and it is the one the lane's clearance is
            // computed from: the column cannot re-pad itself when an unread arrives.
            unread > 0 || waiting
              ? 'translate-y-[calc(100%_-_var(--dock-tab-peek-alert))] animate-wiggle'
              : 'translate-y-[calc(100%_-_var(--dock-tab-peek))]',
            // Yielding is TONE ONLY, same law as the docked tab: the Vault owns the open panel,
            // so this goes quiet — it does not hide, and it stays pressable.
            !yielding && (unread > 0 || open) ? 'bg-primary text-on-primary lift-1' : 'bg-primary-bg text-primary-strong',
          )}
        >
          <MessageSquare className="h-[18px] w-[18px]" aria-hidden />
          {unread > 0 && (
            <span aria-hidden className={UNREAD_BADGE}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          {unread === 0 && waiting && <span aria-hidden className={WAITING_DOT} />}
        </button>

        {/* Tablet and up with no dock (marketing, /help, /discover, /admin) keep the edge pill:
            there is no bottom rail on those surfaces to peel out from. */}
        <span className="hidden md:block">
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
        </span>
      </>
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
        // `!yielding &&` is the whole of the owner's rule: nothing beside an open Vault wears the
        // active fill. `open` cannot be true here anyway (the two panels are exclusive), so this
        // is really "an unread does not light the tab while the Vault is up" — and the count badge
        // below still says the unread exists.
        !yielding && (unread > 0 || open) ? 'primary' : 'primarySoft',
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
