'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Lock, Sparkles } from 'lucide-react'

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

      {/* Live preview countdown pill */}
      {!gated && ready && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-surface/95 px-4 py-2 text-sm font-semibold text-primary-strong shadow-lg backdrop-blur">
            <Sparkles className="h-4 w-4" />
            <span>Preview · {remaining}s</span>
          </div>
        </div>
      )}

      {/* Upgrade modal once gated */}
      {gated && !dismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-surface p-7 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg">
              <Lock className="h-6 w-6 text-primary-strong" />
            </div>
            <h2 className="text-lg font-bold text-text">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            <Link
              href="/upgrade"
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Upgrade membership
            </Link>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="mt-2 w-full rounded-xl px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
            >
              Keep looking
            </button>
          </div>
        </div>
      )}

      {/* After dismissing, a persistent nudge remains over the blurred content */}
      {gated && dismissed && (
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-lg transition-colors hover:bg-primary-hover"
        >
          <Lock className="h-4 w-4" />
          Upgrade to join in
        </button>
      )}
    </div>
  )
}
