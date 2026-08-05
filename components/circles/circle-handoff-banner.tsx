'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gift } from 'lucide-react'
import {
  myCircleOffersAction,
  respondToCircleOfferAction,
} from '@/app/(main)/circles/handoff-actions'
import { isError } from '@/lib/action-result'
import type { CircleOffer } from '@/lib/circles/handoff'

// "Someone wants to hand you this circle" (ADR-845). Renders ONLY for the person an open offer was
// made to, on the circle it concerns, so nobody else learns an offer exists. Self-fetching so the
// circle page needs no new server read; an empty result renders nothing at all.
//
// The server owns every rule. Accepting makes the circle theirs (root-owned, them as host) through
// the same ownership write the immediate transfer uses.

export function CircleHandoffBanner({ circleId }: { circleId: string }) {
  const router = useRouter()
  const [offer, setOffer] = useState<CircleOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let alive = true
    myCircleOffersAction()
      .then((offers) => {
        if (alive) setOffer(offers.find((o) => o.circleId === circleId) ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [circleId])

  if (!offer) return null

  function respond(action: 'accept' | 'decline') {
    setError(null)
    start(async () => {
      const res = await respondToCircleOfferAction(offer!.id, action)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setOffer(null)
      router.refresh()
    })
  }

  return (
    <div className="rounded-card border border-border bg-surface-elevated/60 p-4">
      <div className="flex items-start gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-text">
            {offer.fromName} wants to hand you {offer.circleName}
          </p>
          <p className="mt-0.5 text-meta text-subtle">
            Accept and it becomes your circle, with you hosting. Its members and anything it is
            running come with it.
          </p>
          {error && <p className="mt-2 text-meta text-danger">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => respond('accept')}
              disabled={pending}
              className="rounded-lg bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => respond('decline')}
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-meta font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
            >
              No thanks
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
