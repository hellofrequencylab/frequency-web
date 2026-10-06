'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sprout } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    <div
      data-sister-circle={reason}
      className="mt-3 flex max-w-xl flex-wrap items-center gap-3 rounded-card border border-border bg-surface-elevated px-4 py-3"
    >
      <Sprout className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
      <p className="min-w-0 flex-1 text-body-sm text-text">
        {reason === 'host'
          ? 'Your Circle is nearly full. Start a sister Circle so nobody gets turned away.'
          : 'This Circle is full. Start a sister Circle with the same shape and host it yourself.'}
      </p>
      <Button type="button" size="sm" onClick={seed} disabled={pending} className="shrink-0">
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? 'Starting…' : 'Start a sister Circle'}
      </Button>
      {error && <p className="w-full text-meta text-danger">{error}</p>}
    </div>
  )
}
