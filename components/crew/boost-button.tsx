'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Rocket } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { giveCrewBoost } from '@/lib/crew/boost-actions'

// The Crew Boost (LIVE-756). One tap gives this month's Boost to the Circle or Space on screen for a
// week: a Circle moves up in discovery, a Space wears a Boosted mark and keeps its earned place in the
// directory (owner ruling 2026-10-06, "Circles only"). The server decides everything (Crew, one a month, not your own);
// this button only says the answer in plain words. Copy follows docs/CONTENT-VOICE.md: no urgency,
// no em dashes.

const REFUSAL_COPY = {
  used: "You have given this month's Boost. A new one arrives on the 1st.",
  own: 'A Boost is for something you do not run.',
  not_found: 'This one cannot take a Boost right now.',
} as const

export function BoostButton({
  kind,
  targetId,
  className,
}: {
  kind: 'circle' | 'space'
  targetId: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'given' | 'not_crew' | keyof typeof REFUSAL_COPY | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function give() {
    setError(null)
    startTransition(async () => {
      const r = await giveCrewBoost(kind, targetId)
      if (isError(r)) {
        setState('error')
        setError(r.error)
      } else if (r.data.given) {
        setState('given')
      } else {
        setState(r.data.reason ?? 'error')
      }
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={give}
        disabled={isPending || state === 'given'}
        aria-pressed={state === 'given'}
        className={className ?? buttonClasses('secondary', 'sm')}
      >
        <Rocket className="h-3.5 w-3.5" aria-hidden />
        {state === 'given' ? 'Boosted' : 'Boost'}
      </button>
      <span role="status" className="text-meta text-muted">
        {state === 'given' && 'Boosted for a week. Thanks for vouching.'}
        {state === 'not_crew' && (
          <>
            Boosts come with <Link href="/upgrade" className="font-medium text-primary-strong hover:underline">Crew</Link>.
          </>
        )}
        {(state === 'used' || state === 'own' || state === 'not_found') && REFUSAL_COPY[state]}
        {state === 'error' && error}
      </span>
    </span>
  )
}
