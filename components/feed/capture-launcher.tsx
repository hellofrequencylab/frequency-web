'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, BookOpen, Zap, ChevronRight } from 'lucide-react'
import { observe } from '@/lib/analytics/observe'
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen'
import { useMindless } from '@/components/on-air/mindless'
import { Dialog } from '@/components/ui/dialog'
import { CaptureBox } from './capture-box'
import { EventArt, ContactArt, ConnectArt, PartnersArt, CheckInArt, GhostArt, MindlessArt } from './zap-menu-art'

type Mode = 'post' | 'note' | 'photo' | 'contact'

// Capture — the app-wide primary action (ADR-155/156a). Two triggers, one modal:
//   • mobile  → the raised centre-nav button (MobileTabBar) dispatches 'open-capture'
//     (contact-forward — you're out meeting people);
//   • desktop → a floating FAB (the mobile tab bar isn't there).
// The modal is always mounted so either trigger can open it from any page. Posts
// default to the member's wall.
//
// THE OVERLAY IS `Dialog align="sheet"` (LIVE-089) — full-bleed on mobile, a centred card at sm+,
// which is the exact geometry this hand-rolled one described. It had a real ESC handler and a real
// scroll lock, but it set aria-modal="true" with NO focus trap and no focus restore, so Tab left the
// sheet while a screen reader was told the feed behind it was inert; and it did not portal, so
// opening it from inside the sliding admin rail (which is `transform`ed, and `fixed` anchors to a
// transformed ancestor) rendered the "full-screen" sheet as a narrow sidebar panel.
//
// TWO DELIBERATE CHANGES:
//   · tier z-[70] -> z-[80]. z-[70] is the mobile admin sheet's own tier and this component mounts
//     from app/(main)/layout.tsx on every route beneath it, /admin included, so the two tied.
//   · scrim bg-ink/70 -> bg-ink/60 (the primitive's), a ten-point lightening. Blur unchanged.
// AND ONE REPAIR: the safe-area padding is now the primitive's. `Dialog`'s own comment names this
// file as one of three that each re-solved notch padding by hand and each landed somewhere
// different; `align="sheet"` pads the overlay top and bottom, so the panel's inline
// `paddingBottom: max(1rem, inset)` and the header's `pt-[max(0px,inset)]` are removed as exact
// duplicates rather than adjusted.
export function CaptureLauncher({ scopeId }: { scopeId: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('post')
  // Vera's live line: a static fallback renders instantly; the cheap API
  // (today's cached Dispatch, else a streak template) swaps in when it lands.
  const [veraLine, setVeraLine] = useState<string | null>(null)
  // A live event awaits check-in → the Check In tile pulses (ADR-237).
  const [liveCheckIn, setLiveCheckIn] = useState(false)
  // One-time education line on the very first open (per device).
  const [showIntro, setShowIntro] = useState(false)

  const mindless = useMindless()
  const close = useCallback(() => {
    // Drop true fullscreen the open gesture entered (C.1-3); the modal's own dvh
    // takeover unmounts with it.
    void exitAppFullscreen()
    setOpen(false)
  }, [])
  const tapTile = useCallback(
    (tile: string) => () => {
      observe('zap_menu.tile_tap', { tile })
      close()
    },
    [close],
  )
  // Mindless is the ONE timer door now (Be Still + Get Moving in one overlay). It opens in
  // place (its loading takeover paints instantly) instead of navigating to /on-air — so the Zap
  // sheet hands straight off to the timer with no flash of the page behind while it loads.
  const openMindless = useCallback(() => {
    observe('zap_menu.tile_tap', { tile: 'mindless' })
    // Hand the fullscreen straight to the Mindless overlay — open it first (it
    // keeps/re-requests fullscreen), then just drop the Capture modal WITHOUT
    // exiting fullscreen, so there's no flicker between the two takeovers.
    mindless.open()
    setOpen(false)
  }, [mindless])

  useEffect(() => {
    if (!open || veraLine) return
    let on = true
    fetch('/api/zap-prompt')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!on) return
        if (d?.line) setVeraLine(d.line)
        if (typeof d?.liveEvent === 'boolean') setLiveCheckIn(d.liveEvent)
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [open, veraLine])

  // The centre-nav button (and anything else) opens the modal via a window event,
  // optionally requesting a starting mode.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const m = (e as CustomEvent).detail?.mode as Mode | undefined
      setMode(m ?? 'post')
      // Go fullscreen on the same gesture that dispatched 'open-capture' (the
      // centre-nav button / FAB) — window listeners run synchronously inside that
      // click, so the gesture-gated request still lands (C.1-3). Best-effort.
      void requestAppFullscreen()
      setOpen(true)
      observe('zap_menu.open')
      try {
        if (!localStorage.getItem('fq_zap_intro_seen')) {
          setShowIntro(true)
          localStorage.setItem('fq_zap_intro_seen', '1')
        }
      } catch {
        // private mode: no intro persistence, no problem
      }
    }
    window.addEventListener('open-capture', onOpen)
    return () => window.removeEventListener('open-capture', onOpen)
  }, [])

  return (
    <>
      {/* No desktop button — Capture lives in the mobile centre-nav; on web the feed's
          inline Capture box is the entry. This component only hosts the modal. */}
      <Dialog open={open} onClose={close} ariaLabel="Capture a moment" align="sheet" className="h-full sm:h-auto sm:max-w-md">
          {/* Full-screen on mobile, a centred card on desktop. */}
          <div
            className="relative flex h-full w-full flex-col overflow-y-auto border-border bg-canvas p-4 lift-3 sm:h-auto sm:max-h-[90vh] sm:rounded-card sm:border"
          >
            {/* Header — the Zap menu: where the interactive energy starts.
                Vera's live line reacts to the member's day (streak, next step);
                it renders instantly from a fallback and swaps when the cheap
                cached line arrives. */}
            <div className="mb-4 flex shrink-0 items-start justify-between gap-2 px-1">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-primary-strong">
                  <Zap className="h-5 w-5 fill-primary-strong/20" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-body font-bold text-text">Capture a moment</p>
                  <p className="text-meta leading-relaxed text-muted">
                    {veraLine ?? 'Catch something real from the day.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-pill p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {showIntro && (
              <p className="mb-3 shrink-0 rounded-card bg-primary-bg/50 px-3 py-2 text-meta leading-relaxed text-primary-strong">
                First time? Everything in this menu earns. Tap a tile, do the real
                thing, and the Zaps follow.
              </p>
            )}

            {/* The prompt box — sharing stays the zero-tap action. */}
            <CaptureBox
              key={mode}
              scopeId={scopeId}
              visibility="public"
              defaultMode={mode}
              compactTools
              placeholder="Share something real from your day…"
            />

            {/* Mindless — the daily ritual sits just BELOW the post box (owner). Be Still + Get
                Moving in one overlay. */}
            <button
              type="button"
              onClick={openMindless}
              className="group mt-3 flex w-full shrink-0 items-center gap-3 overflow-hidden rounded-card border-2 border-primary/50 bg-gradient-to-br from-primary-bg/80 to-primary-bg/25 p-3.5 text-left lift-1 transition-all hover:border-primary active:scale-[0.99]"
            >
              <MindlessArt className="block h-12 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="block text-body font-bold leading-tight text-text">Mindless</span>
                  <span className="hidden shrink-0 rounded-pill bg-primary/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-primary-strong min-[400px]:inline-block">
                    Daily timer
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-meta leading-snug text-muted">
                  Tune out.
                </span>
              </span>
              <span className="flex h-8 shrink-0 items-center gap-0.5 rounded-pill bg-primary pl-3 pr-2 text-meta font-bold text-on-primary shadow-sm transition-transform group-hover:scale-105">
                Start
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>

            {/* The tools — the live capture rows (every tile earns, ADR-236). */}
            <div className="mt-5 grid shrink-0 grid-cols-3 gap-2.5">
              <ZapTile href="/events/scan" onClick={tapTile('event')} label="Event" zaps="+20" art={<EventArt className="block h-12" />} sub="Snap a poster" />
              <ZapTile href="/connections/new" onClick={tapTile('contact')} label="Contact" art={<ContactArt className="block h-12" />} sub="Snap a card" />
              <ZapTile href="/codes" onClick={tapTile('connect')} label="Connect" art={<ConnectArt className="block h-12" />} sub="Share your code" />
              <ZapTile href="/scan?hint=checkin" onClick={tapTile('checkin')} label="Check In" zaps="+25" art={<CheckInArt className="block h-12" />} sub={liveCheckIn ? 'Happening now' : 'Scan at the door'} soon />
              <ZapTile href="/scan?hint=node" onClick={tapTile('node')} label="Ghost Node" zaps="+10" art={<GhostArt className="block h-12" />} sub="Out hunting" soon />
              <ZapTile href="/partners" onClick={tapTile('partners')} label="Partners" art={<PartnersArt className="block h-12" />} sub="Local rewards" soon />
            </div>

            <Link
              href="/journal"
              onClick={tapTile('journal')}
              className="mt-4 flex shrink-0 items-center justify-center gap-1.5 rounded-control px-3 py-2.5 text-meta font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> View your log
            </Link>
          </div>
      </Dialog>
    </>
  )
}

// One tool tile: art over a clean label, a soft wash, a quiet zap chip when the
// act pays. Big tap target, gentle press. `soon` renders the same shape inert.
function ZapTile({
  href,
  onClick,
  label,
  sub,
  zaps,
  art,
  soon = false,
  alert = false,
}: {
  href?: string
  onClick?: () => void
  label: string
  sub: string
  zaps?: string
  art: React.ReactNode
  soon?: boolean
  /** Something is happening RIGHT NOW behind this tile (ADR-237): a quiet
   *  pulsing dot + a warmer border, never a takeover. */
  alert?: boolean
}) {
  const inner = (
    <>
      {alert && (
        <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-pill bg-primary motion-safe:animate-pulse" />
      )}
      <span className="flex h-12 w-full items-center justify-center">{art}</span>
      <span className="mt-1.5 block text-body-sm font-bold text-text">{label}</span>
      <span className="block text-2xs leading-snug text-muted">{soon ? 'Soon' : sub}</span>
      {zaps && (
        <span className="mt-1 inline-flex items-center gap-0.5 rounded-pill bg-primary-bg px-1.5 py-0.5 text-3xs font-bold text-primary-strong">
          <Zap className="h-2.5 w-2.5" /> {zaps}
        </span>
      )}
    </>
  )
  const cls =
    'relative flex flex-col items-center rounded-card border p-3 text-center transition-all ' +
    (soon
      ? 'cursor-default border-dashed border-border bg-surface/50 opacity-60'
      : alert
        ? 'border-primary bg-primary-bg/60 hover:bg-primary-bg/80 active:scale-[0.97]'
        : 'border-primary/30 bg-primary-bg/40 hover:border-primary/60 hover:bg-primary-bg/70 active:scale-[0.97]')
  if (soon || !href) {
    return <div className={cls}>{inner}</div>
  }
  return (
    <Link href={href} onClick={onClick} className={cls}>
      {inner}
    </Link>
  )
}
