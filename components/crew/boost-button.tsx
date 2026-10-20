'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Rocket } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { giveCrewBoost, readMyBoostStatus } from '@/lib/crew/boost-actions'

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
  const [standing, setStanding] = useState<{ crew: boolean; left: 0 | 1 } | null>(null)
  const [tip, setTip] = useState(false)

  // The tooltip reads the viewer's standing once, on first hover or focus, so the page itself stays cacheable.
  function showTip() {
    setTip(true)
    if (standing === null) {
      void readMyBoostStatus().then((r) => {
        if (!isError(r)) setStanding(r.data)
      })
    }
  }

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
      <span
        className="relative inline-flex"
        onMouseEnter={showTip}
        onMouseLeave={() => setTip(false)}
        onFocus={showTip}
        onBlur={() => setTip(false)}
      >
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
      {tip && state === 'idle' && (
        <span
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-control bg-text px-3 py-2 text-left text-2xs font-medium leading-snug text-on-primary"
        >
          <BoostTipCopy kind={kind} standing={standing} />
        </span>
      )}
      </span>
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

// What the tooltip says, by who is asking. A Member (not Crew) learns what Boost does and that it comes with
// Crew; a Crew member learns it is one a month, what it does here, and how many they have left.
function BoostTipCopy({ kind, standing }: { kind: 'circle' | 'space'; standing: { crew: boolean; left: 0 | 1 } | null }) {
  const effect =
    kind === 'circle'
      ? 'This moves the Circle up the Circles list for a week.'
      : 'This puts a Boosted mark on the Space for a week. It does not change where the Space sits in the directory.'
  if (standing === null) return <>Vouch for something you want more people to find.</>
  if (!standing.crew) {
    return (
      <>
        A Boost is how a Crew member vouches for a {kind}. {effect} Boosts come with Crew, one a month.{' '}
        <Link href="/upgrade" className="font-bold underline">
          Join Crew
        </Link>
      </>
    )
  }
  return (
    <>
      {standing.left === 1 ? 'You have 1 Boost left this month.' : "You have used this month's Boost. A new one arrives on the 1st."} {effect}{' '}
      {kind === 'circle' ? 'On a Space, a Boost adds a Boosted mark instead.' : 'On a Circle, a Boost moves it up the list instead.'}
    </>
  )
}
