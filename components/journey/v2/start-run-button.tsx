'use client'

// Journeys v2 — the Host "Start a Run" control (ADR-252, J2b). Lives in the Circle's host rail:
// pick a published Journey and launch it as a cohort Run for the Circle — everyone enrolls and
// moves through it together, one phase a week. Host-gated server-side (startJourneyRunAction).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startJourneyRunAction } from '@/app/(main)/journeys/run-actions'

export interface JourneyOption {
  id: string
  title: string
  slug: string
  emoji: string | null
}

export function StartRunButton({ circleId, journeys }: { circleId: string; journeys: JourneyOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [planId, setPlanId] = useState(journeys[0]?.id ?? '')
  const [kickoff, setKickoff] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string; slug?: string } | null>(null)

  if (journeys.length === 0) {
    return <p className="text-xs leading-relaxed text-muted">No published journeys yet. Create one, publish it, then run it with your circle.</p>
  }
  const selected = journeys.find((j) => j.id === planId)

  function go() {
    if (!planId) return
    start(async () => {
      const res = await startJourneyRunAction({ planId, circleId, kickoffAt: kickoff || null, journeyTitle: selected?.title })
      if (isError(res)) {
        setMsg({ ok: false, text: res.error })
        return
      }
      setMsg({
        ok: true,
        text: kickoff ? 'Run started, kickoff meetup scheduled. Your circle is enrolled.' : 'Run started. Your circle is enrolled.',
        slug: selected?.slug,
      })
      router.refresh()
    })
  }

  return (
    <div>
      <p className="mb-2 text-xs leading-relaxed text-muted">
        Run a journey with your circle. Everyone moves through it together, one phase a week.
      </p>
      <select
        value={planId}
        onChange={(e) => setPlanId(e.target.value)}
        className="mb-2 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text"
      >
        {journeys.map((j) => (
          <option key={j.id} value={j.id}>
            {j.emoji ? `${j.emoji} ` : ''}
            {j.title}
          </option>
        ))}
      </select>
      <label className="mb-2 block">
        <span className="mb-1 block text-2xs font-medium text-subtle">Kickoff meetup (optional)</span>
        <input
          type="datetime-local"
          value={kickoff}
          onChange={(e) => setKickoff(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text"
        />
      </label>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        <Rocket className="h-4 w-4" /> {pending ? 'Starting…' : 'Start the run'}
      </button>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>
          {msg.text}
          {msg.ok && msg.slug && (
            <>
              {' '}
              <a href={`/journeys/${msg.slug}/learn`} className="font-medium underline">
                Open it
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
