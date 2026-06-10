'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, BookOpen, ScanLine, Compass, ArrowRight, MapPin, CalendarCheck, CalendarPlus, ContactRound, Ghost } from 'lucide-react'
import { CaptureBox } from './capture-box'

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

  const close = useCallback(() => setOpen(false), [])

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
            {/* Header — quest-framed: this is the player catching something real from
                the world, an expression of the Quest they're on. */}
            <div className="mb-3 flex shrink-0 items-start justify-between gap-2 px-1 pt-[max(0px,env(safe-area-inset-top))]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
                  <Compass className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-text">Capture a moment</p>
                  <p className="text-xs text-muted">A piece of your Quest, caught from real life.</p>
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

            {/* The reader — the hero of this surface. Point your camera at a business
                card or an event poster; each row spells out the real-world outcome. */}
            <Link
              href="/connections/new"
              onClick={close}
              className="group mb-4 flex shrink-0 items-center gap-4 overflow-hidden rounded-2xl border border-primary/40 bg-primary-bg/60 p-5 transition-colors hover:border-primary/60 hover:bg-primary-bg/80"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-pop">
                <ScanLine className="h-7 w-7" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-text">Capture a card or poster</span>
                <span className="mt-1.5 flex items-start gap-1.5">
                  <ContactRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
                    Business card: snaps straight into your contacts, details filled in.
                  </span>
                </span>
                <span className="mt-1 flex items-start gap-1.5">
                  <CalendarPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
                    Event poster: becomes an event draft for local events.
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-elevated px-1.5 text-3xs uppercase text-subtle">
                    Soon
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary-strong transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>

            {/* …or capture by hand */}
            <div className="mb-3 flex shrink-0 items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">or capture by hand</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* The blip — this page is about logging real life, not posting online. */}
            <p className="mb-3 shrink-0 px-1 text-xs leading-relaxed text-muted">
              This is your log of real life: who you met, where you showed up, what actually
              happened. Catch it while it&rsquo;s fresh.
            </p>

            <CaptureBox
              key={mode}
              scopeId={scopeId}
              visibility="public"
              defaultMode={mode}
              placeholder="What happened out there?"
            />

            {/* Coming soon — the next real-world capture types, visible but inert so
                members can see where this surface is headed. */}
            <div className="mt-4 shrink-0">
              <p className="mb-2 px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Coming soon</p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { Icon: MapPin, label: 'Local check-in' },
                  { Icon: CalendarCheck, label: 'Event check-in' },
                  { Icon: Ghost, label: 'Capture a Ghost Node' },
                ].map(({ Icon, label }) => (
                  <button
                    key={label}
                    type="button"
                    disabled
                    aria-disabled
                    className="flex cursor-not-allowed items-center gap-3 rounded-2xl border border-dashed border-border bg-surface/50 p-3 text-left opacity-60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-subtle">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-muted">{label}</span>
                    <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-subtle">
                      Soon
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Link
              href="/journal"
              onClick={close}
              className="mt-3 flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> View your journal
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
