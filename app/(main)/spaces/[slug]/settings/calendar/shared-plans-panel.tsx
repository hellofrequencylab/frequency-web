'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { isError } from '@/lib/action-result'
import { incomingWords, type IncomingPlanShare, type SharedPlanView } from '@/lib/calendar/plan-shares'
import { planStageLabel } from './plan-rail-plan'
import { PlanDrawer } from './plan-drawer'
import { respondToPlanShare } from './plan-actions'

// SHARED WITH YOU, the guest half of the handshake (PROG-CAL7 Together, LIVE-541). A Plan another
// Space offered lands here PENDING, with the two answers side by side, and nothing reaches this
// team's board until they say yes. An accepted Plan is listed with the Space that holds it and opens
// in the same drawer the host uses, read only: the host keeps every door until a later child of
// PROG-CAL7 hands some across. The server resolved each offer's title and host for exactly the
// share rows this Space may read (lib/calendar/plan-share-subjects.ts); the panel adds no words of
// its own beyond the two answers.

export function SharedPlansPanel({
  slug,
  incoming,
  sharedPlans,
}: {
  slug: string
  incoming: IncomingPlanShare[]
  sharedPlans: SharedPlanView[]
}) {
  const [pending, start] = useTransition()
  const [offers, setOffers] = useState<IncomingPlanShare[]>(incoming)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<SharedPlanView | null>(null)

  const [syncedIncoming, setSyncedIncoming] = useState(incoming)
  if (incoming !== syncedIncoming) {
    setSyncedIncoming(incoming)
    setOffers(incoming)
  }

  const answer = (share: IncomingPlanShare, verdict: 'accepted' | 'declined') => {
    setError(null)
    setNotice(null)
    start(async () => {
      const res = await respondToPlanShare(slug, share.id, verdict)
      if (isError(res)) setError(res.error)
      else {
        setOffers((cur) => cur.filter((o) => o.id !== share.id))
        setNotice(
          verdict === 'accepted'
            ? `You are working ${share.planTitle ? `"${share.planTitle}"` : 'that Plan'} together now. It shows up here once the page refreshes.`
            : 'Passed. They can offer it again later.',
        )
      }
    })
  }

  // Nothing shared, nothing said: the strip stays out of the page. Once an answer has been given
  // the sentence about it stays until the page refreshes, even when it was the last offer.
  if (offers.length === 0 && sharedPlans.length === 0 && !notice && !error) return null

  return (
    <div className="space-y-3 pt-2" data-shared-plans>
      <SectionHeader title="Shared with you" count={offers.length + sharedPlans.length} />
      {offers.length > 0 && (
        <ul className="space-y-2 text-body-sm text-text" data-shared-plan-offers>
          {offers.map((share) => (
            <li key={share.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2" data-shared-plan-offer={share.id}>
              <span>{incomingWords(share)}</span>
              <span className="flex gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={() => answer(share, 'accepted')}>
                  Yes, work it together
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => answer(share, 'declined')}>
                  Not this one
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {sharedPlans.length > 0 && (
        <ul className="space-y-1 text-body-sm text-text" data-shared-plan-list>
          {sharedPlans.map((view) => (
            <li key={view.plan.id} className="flex items-center justify-between gap-2" data-shared-plan={view.plan.id}>
              <span>
                {view.plan.title}
                <span className="text-muted"> {`· ${planStageLabel(view.plan.stage)}${view.hostName ? ` · with ${view.hostName}` : ''}`}</span>
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(view)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="text-body-sm text-text" data-shared-plan-notice>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
      <PlanDrawer slug={slug} plan={open?.plan ?? null} open={open !== null} onClose={() => setOpen(null)} readOnly sharedFrom={open?.hostName ?? null} />
    </div>
  )
}
