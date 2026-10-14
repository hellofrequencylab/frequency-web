'use client'

// The public Mindless timer (LIVE-805) on the Frequency design. The SAME session as
// app/(marketing)/mindless/public-timer.tsx: one breathing pacer (Coherence, five in and five out), one
// 5-minute clock, nothing saved, nothing sent, no analytics event. The length and the "Same time
// tomorrow?" destination are read from that module, so the two designs can never run a different session.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BREATH_PATTERNS } from '@/lib/on-air'
import { BreathVisualizer } from '@/components/on-air/visualizer'
import { PUBLIC_SESSION_SECONDS, SAME_TIME_TOMORROW_HREF } from '@/app/(marketing)/mindless/public-timer'
import { FnOutcome } from './parts'

const PATTERN = BREATH_PATTERNS.find((p) => p.slug === 'cohere') ?? BREATH_PATTERNS[0]

type Phase = { kind: 'ready' } | { kind: 'running'; startedAt: number } | { kind: 'done' }

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function FrequencyMindlessTimer() {
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
      <FnOutcome
        role="status"
        tone="success"
        icon="breath"
        title="Same time tomorrow?"
        action={
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={SAME_TIME_TOMORROW_HREF}>
              Yes, same time tomorrow
            </Link>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setLeft(PUBLIC_SESSION_SECONDS)
                setPhase({ kind: 'ready' })
              }}
            >
              Sit again
            </button>
          </div>
        }
      >
        Five minutes, done. Make a free account and tomorrow&apos;s session is one tap away, with every one after
        it counted toward your streak.
      </FnOutcome>
    )
  }

  return (
    <div className="fn-box fn-timer">
      <div className="fn-vis">
        <BreathVisualizer
          pattern={PATTERN}
          startedAt={phase.kind === 'running' ? phase.startedAt : 0}
          paused={phase.kind !== 'running'}
        />
      </div>
      <p className="fn-clock" aria-live="off">
        {clock(left)}
      </p>
      <p>{PATTERN.blurb} A 5-minute practice. No account needed.</p>
      <div className="ctas">
        {phase.kind === 'running' ? (
          <button className="btn btn-ghost" type="button" onClick={() => setPhase({ kind: 'done' })}>
            End early
          </button>
        ) : (
          <button
            className="btn fq-iri-btn"
            type="button"
            onClick={() => setPhase({ kind: 'running', startedAt: Date.now() })}
          >
            Start 5 minutes
          </button>
        )}
      </div>
    </div>
  )
}
