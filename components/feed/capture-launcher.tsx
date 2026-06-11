'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, BookOpen, Zap, ChevronRight } from 'lucide-react'
import { CaptureBox } from './capture-box'
import { EventArt, ContactArt, ConnectArt, PartnersArt, CheckInArt, GhostArt, MindlessArt } from './zap-menu-art'

type Mode = 'post' | 'note' | 'photo' | 'contact'

// Capture — the app-wide primary action (ADR-155/156a). Two triggers, one modal:
//   • mobile  → the raised centre-nav button (MobileTabBar) dispatches 'open-capture'
//     (contact-forward — you're out meeting people);
//   • desktop → a floating FAB (the mobile tab bar isn't there).
// The modal is always mounted so either trigger can open it from any page. Posts
// default to the member's wall.
export function CaptureLauncher({ scopeId }: { scopeId: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('post')
  // Vera's live line: a static fallback renders instantly; the cheap API
  // (today's cached Dispatch, else a streak template) swaps in when it lands.
  const [veraLine, setVeraLine] = useState<string | null>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open || veraLine) return
    let on = true
    fetch('/api/zap-prompt')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (on && d?.line) setVeraLine(d.line)
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
      setOpen(true)
    }
    window.addEventListener('open-capture', onOpen)
    return () => window.removeEventListener('open-capture', onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <>
      {/* No desktop button — Capture lives in the mobile centre-nav; on web the feed's
          inline Capture box is the entry. This component only hosts the modal. */}
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          {/* Full-screen on mobile, a centred card on desktop. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Capture a moment"
            className="relative flex w-full flex-col overflow-y-auto border-border bg-canvas p-4 shadow-2xl motion-safe:animate-[slideUp_0.25s_ease-out] sm:max-h-[90vh] sm:max-w-md sm:rounded-3xl sm:border"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {/* Header — the Zap menu: where the interactive energy starts.
                Vera's live line reacts to the member's day (streak, next step);
                it renders instantly from a fallback and swaps when the cheap
                cached line arrives. */}
            <div className="mb-4 flex shrink-0 items-start justify-between gap-2 px-1 pt-[max(0px,env(safe-area-inset-top))]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
                  <Zap className="h-5 w-5 fill-primary-strong/20" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-text">Capture a moment</p>
                  <p className="text-xs leading-relaxed text-muted">
                    {veraLine ?? 'Catch something real from the day.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* The prompt box — sharing stays the zero-tap action. */}
            <CaptureBox
              key={mode}
              scopeId={scopeId}
              visibility="public"
              defaultMode={mode}
              compactTools
              placeholder="Share something real from your day…"
            />

            {/* The tools — Mindless leads (the daily ritual outranks the captures),
                then the live row, then what's on the way. */}
            <div className="mt-5 grid shrink-0 grid-cols-3 gap-2.5">
              <Link
                href="/on-air"
                onClick={close}
                className="group col-span-3 flex items-center gap-4 overflow-hidden rounded-2xl border-2 border-primary/50 bg-gradient-to-br from-primary-bg/80 to-primary-bg/25 p-4 shadow-sm transition-all hover:border-primary hover:shadow-md active:scale-[0.99]"
              >
                <MindlessArt className="block h-16 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="block text-lg font-bold text-text">Mindless</span>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-primary-strong">
                      Daily sit
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    Breathe, sit, or just tune out. Your daily reset, your way.
                  </span>
                </span>
                <span className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary pl-3.5 pr-2.5 text-sm font-bold text-on-primary shadow-sm transition-transform group-hover:scale-105">
                  Start
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
              <ZapTile href="/events/scan" onClick={close} label="Event" zaps="+20" art={<EventArt className="block h-12" />} sub="Snap a poster" />
              <ZapTile href="/connections/new" onClick={close} label="Contact" art={<ContactArt className="block h-12" />} sub="Snap a card" />
              <ZapTile href="/codes" onClick={close} label="Connect" art={<ConnectArt className="block h-12" />} sub="Share your code" />
              <ZapTile soon label="Check In" zaps="+25" art={<CheckInArt className="block h-12" />} sub="At the door" />
              <ZapTile soon label="Ghost Node" zaps="+10" art={<GhostArt className="block h-12" />} sub="Out hunting" />
              <ZapTile soon label="Partners" art={<PartnersArt className="block h-12" />} sub="Local rewards" />
            </div>

            <Link
              href="/journal"
              onClick={close}
              className="mt-4 flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> View your log
            </Link>
          </div>
        </div>
      )}
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
}: {
  href?: string
  onClick?: () => void
  label: string
  sub: string
  zaps?: string
  art: React.ReactNode
  soon?: boolean
}) {
  const inner = (
    <>
      <span className="flex h-12 w-full items-center justify-center">{art}</span>
      <span className="mt-1.5 block text-sm font-bold text-text">{label}</span>
      <span className="block text-2xs leading-snug text-subtle">{soon ? 'Soon' : sub}</span>
      {zaps && (
        <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-primary-bg px-1.5 py-0.5 text-3xs font-bold text-primary-strong">
          <Zap className="h-2.5 w-2.5" /> {zaps}
        </span>
      )}
    </>
  )
  const cls =
    'flex flex-col items-center rounded-2xl border p-3 text-center transition-all ' +
    (soon
      ? 'cursor-default border-dashed border-border bg-surface/50 opacity-60'
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
