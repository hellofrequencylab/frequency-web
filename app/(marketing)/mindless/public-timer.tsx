'use client'

// The public Mindless timer (LIVE-805, ADR-1720 workstream 8). The Calm down fast funnel's first
// win is a 5-minute session, and the member timer (/on-air) sits behind sign-in, so this is the
// no-account version: one breathing pacer, one 5-minute clock, nothing saved and nothing sent.
// Client only: no server action, no writes, no analytics event. When the clock ends it asks
// "Same time tomorrow?" and the answer is a free account that opens on the member timer.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BREATH_PATTERNS } from '@/lib/on-air'
import { BreathVisualizer } from '@/components/on-air/visualizer'
import { Button, buttonClasses } from '@/components/ui/button'

/** The one preset: five minutes, the length of the funnel's first win. */
export const PUBLIC_SESSION_SECONDS = 5 * 60

// Coherence (five in, five out, no holds) is the easiest pattern to follow cold.
const PATTERN = BREATH_PATTERNS.find((p) => p.slug === 'cohere') ?? BREATH_PATTERNS[0]

/** Where "Same time tomorrow?" goes: a free account that lands on the member timer. */
export const SAME_TIME_TOMORROW_HREF = '/join?next=/on-air'

type Phase = { kind: 'ready' } | { kind: 'running'; startedAt: number } | { kind: 'done' }

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function PublicTimer() {
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' })
  const [left, setLeft] = useState(PUBLIC_SESSION_SECONDS)

  useEffect(() => {
    if (phase.kind !== 'running') return
    const id = setInterval(() => {
      const remaining = PUBLIC_SESSION_SECONDS - (Date.now() - phase.startedAt) / 1000
      if (remaining <= 0) {
        setLeft(0)
        setPhase({ kind: 'done' })
      } else {
        setLeft(remaining)
      }
    }, 250)
    return () => clearInterval(id)
  }, [phase])

  if (phase.kind === 'done') {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center" role="status">
        <p className="eyebrow text-primary-strong">Five minutes, done</p>
        <h2 className="text-display-h3 font-semibold text-text">Same time tomorrow?</h2>
        <p className="text-body text-muted">
          Make a free account and tomorrow&apos;s session is one tap away, with every one after it counted toward your streak.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={SAME_TIME_TOMORROW_HREF} className={buttonClasses('primary', 'md')}>
            Yes, same time tomorrow
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setLeft(PUBLIC_SESSION_SECONDS)
              setPhase({ kind: 'ready' })
            }}
          >
            Sit again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
      <div className="aspect-square w-full max-w-xs">
        <BreathVisualizer
          pattern={PATTERN}
          startedAt={phase.kind === 'running' ? phase.startedAt : 0}
          paused={phase.kind !== 'running'}
        />
      </div>
      <p className="font-mono text-stat tabular-nums text-text" aria-live="off">
        {clock(left)}
      </p>
      <p className="text-body-sm text-muted">{PATTERN.blurb} A 5-minute practice. No account needed.</p>
      {phase.kind === 'running' ? (
        <Button variant="secondary" onClick={() => setPhase({ kind: 'done' })}>
          End early
        </Button>
      ) : (
        <Button onClick={() => setPhase({ kind: 'running', startedAt: Date.now() })}>Start 5 minutes</Button>
      )}
    </div>
  )
}
