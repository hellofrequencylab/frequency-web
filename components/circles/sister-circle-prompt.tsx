'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { seedSisterCircleAction } from '@/app/(main)/circles/remix-actions'

// "Start a sister Circle" (LIVE-665). Shown under the seat bar when lib/circles/sister.ts
// sisterCircleOffer says so: to the host as their Circle nears its cap, and to a member who finds it
// full. One tap seeds a private draft they host and opens its editor. The action re-checks the offer.
export function SisterCirclePrompt({ circleId, reason }: { circleId: string; reason: 'host' | 'full' }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const seed = () => {
    setError(null)
    start(async () => {
      try {
        const res = await seedSisterCircleAction(circleId)
        router.push(`/circles/${res.slug}/edit`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start the sister Circle. Try again.')
      }
    })
  }

  return (
    <div data-sister-circle={reason} className="fqc-nearly">
      <p>
        {reason === 'host'
          ? 'Your Circle is nearly full. Start a sister Circle so nobody gets turned away.'
          : 'This Circle is full. Start a sister Circle with the same shape and host it yourself.'}
      </p>
      <button type="button" className="btn sm ink" onClick={seed} disabled={pending}>
        {pending ? 'Starting…' : 'Start a sister Circle'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
