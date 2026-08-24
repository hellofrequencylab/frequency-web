'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Lock, Sparkles } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

// A soft "tease" gate. Below-tier members can READ gated content for a metered
// preview, but any attempt to ENGAGE (or running out the timer) blurs it and
// shows an upgrade prompt. The content is intentionally in the DOM — that's what
// makes the peek instant and lets them see what they're missing. Truly sensitive
// data should still be gated server-side; this is for teasing premium surfaces.
//
// Usage (server component passes `allowed`):
//   <TeaserGate allowed={atLeastRole(role, 'crew')} resourceKey={`circle:${id}`}>
//     {body}
//   </TeaserGate>
//
// THE UPGRADE PROMPT IS `Dialog` (LIVE-089). It was the WORST of the six hand-rolled overlays on
// a11y, and in the opposite way to the other five: where they claimed aria-modal="true" and had no
// focus trap, this one had no dialog role at all — no name, no modal semantics, no ESC, no scroll
// lock, and no focus management of any kind. A screen reader met an unannounced box; a keyboard
// user tabbed through the blurred content behind it.
//
// TWO DELIBERATE CHANGES:
//   · tier z-50 -> z-[80]. z-50 is the app shell's own mobile drawer tier, so which one painted on
//     top was decided by DOM order rather than by anyone.
//   · scrim bg-ink/40 + backdrop-blur-[2px] -> the primitive's bg-ink/60 + backdrop-blur-sm. The
//     light scrim looked like it was protecting the tease, but the tease is protected by the
//     CONTENT's own treatment, which is untouched here (blur-[6px] + opacity-60 on the subtree):
//     what you can still make out behind the card does not change.
// AND ONE ADDITION that follows from the primitive: ESC and a backdrop click now dismiss, landing
// on exactly the state the "Keep looking" button already reached — the gate stays tripped and the
// persistent upgrade nudge takes over.

const METER_KEY = 'freq_teaser_meter_v1'

function readMeter(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(METER_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeMeter(key: string, secondsLeft: number) {
  try {
    const m = readMeter()
    m[key] = secondsLeft
    localStorage.setItem(METER_KEY, JSON.stringify(m))
  } catch {
    /* localStorage unavailable — meter is best-effort */
  }
}

export function TeaserGate({
  allowed,
  resourceKey,
  previewSeconds = 30,
  title = 'Upgrade for the full experience',
  body = 'Members can take a look around. Crew members join Circles, RSVP to events, post, and connect.',
  children,
}: {
  allowed: boolean
  resourceKey: string
  previewSeconds?: number
  title?: string
  body?: string
  children: React.ReactNode
}) {
  const [gated, setGated] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [remaining, setRemaining] = useState(previewSeconds)
  const [ready, setReady] = useState(false)
  const remainingRef = useRef(previewSeconds)
  // The prompt names itself by its own heading, and a page can mount several gates.
  const titleId = useId()

  const trip = useCallback(() => {
    remainingRef.current = 0
    writeMeter(resourceKey, 0)
    setRemaining(0)
    setGated(true)
  }, [resourceKey])

  // On mount (client only): read the persisted per-resource meter, reflect it,
  // and run the countdown. setState is deferred out of the synchronous effect
  // body (avoids cascading renders); the interval pauses while the tab is hidden
  // so a backgrounded tab isn't "spent".
  useEffect(() => {
    if (allowed) return
    let current = readMeter()[resourceKey]
    if (typeof current !== 'number') current = previewSeconds
    remainingRef.current = current

    queueMicrotask(() => {
      setRemaining(current)
      setReady(true)
      if (current <= 0) setGated(true)
    })

    if (current <= 0) return

    const id = window.setInterval(() => {
      if (document.hidden) return
      current = Math.max(0, current - 1)
      remainingRef.current = current
      setRemaining(current)
      writeMeter(resourceKey, current)
      if (current <= 0) {
        window.clearInterval(id)
        setGated(true)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [allowed, resourceKey, previewSeconds])

  if (allowed) return <>{children}</>

  // Any click inside the gated subtree = an attempt to engage → trip the gate.
  const onClickCapture = (e: React.MouseEvent) => {
    if (gated) return
    e.preventDefault()
    e.stopPropagation()
    trip()
  }

  return (
    <div className="relative" onClickCapture={onClickCapture}>
      <div
        className={`transition-[filter,opacity] duration-500 ${
          gated ? 'blur-[6px] opacity-60 select-none pointer-events-none' : ''
        }`}
        aria-hidden={gated || undefined}
        inert={gated || undefined}
      >
        {children}
      </div>

      {/* Live preview countdown pill. Clears the mobile tab bar (3.5rem + inset) rather than
          sitting at a flat 24px: at bottom-6 this rendered BEHIND the bar on every app route
          this gate is mounted on. */}
      {!gated && ready && (
        <div className="pointer-events-none fixed bottom-[calc(var(--tab-bar-clearance)+0.75rem)] md:bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-pill border border-primary/30 bg-surface/95 px-4 py-2 text-body-sm font-semibold text-primary-strong lift-3 backdrop-blur">
            <Sparkles className="h-4 w-4" />
            <span>Preview · {remaining}s</span>
          </div>
        </div>
      )}

      {/* Upgrade modal once gated */}
      <Dialog
        open={gated && !dismissed}
        onClose={() => setDismissed(true)}
        ariaLabelledBy={titleId}
        align="center"
        className="max-w-sm"
      >
        <div className="relative w-full rounded-3xl border border-border bg-surface p-7 text-center lift-3">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg">
            <Lock className="h-6 w-6 text-primary-strong" />
          </div>
          <h2 id={titleId} className="text-body-lg font-bold text-text">{title}</h2>
          <p className="mt-2 text-body-sm leading-relaxed text-muted">{body}</p>
          <Link
            href="/upgrade"
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Upgrade membership
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-2 w-full rounded-xl px-5 py-2.5 text-body-sm font-medium text-muted transition-colors hover:text-text"
          >
            Keep looking
          </button>
        </div>
      </Dialog>

      {/* After dismissing, a persistent nudge remains over the blurred content */}
      {gated && dismissed && (
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="fixed bottom-[calc(var(--tab-bar-clearance)+0.75rem)] md:bottom-6 left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-body-sm font-bold text-on-primary lift-3 transition-colors hover:bg-primary-hover"
        >
          <Lock className="h-4 w-4" />
          Upgrade to join in
        </button>
      )}
    </div>
  )
}
