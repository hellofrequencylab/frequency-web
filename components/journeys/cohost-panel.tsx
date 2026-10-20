'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Loader2 } from 'lucide-react'
import { Field, Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { isError, type ActionResult } from '@/lib/action-result'
import type { CoHostShareView } from '@/lib/journeys/cohost-shares'
import {
  inviteJourneyCoHost,
  acceptJourneyCoHost,
  declineJourneyCoHost,
  revokeJourneyCoHost,
} from '@/app/(main)/spaces/[slug]/journeys/cohost-actions'

// CO-HOSTING (SCAN-840) on the Space's Journeys manager: invite another Space to co-host one of this
// Space's Journeys, accept or decline an invite from another Space, and end a live co-host. The server
// actions are the authority; this only renders what the page already gated. No em dashes.

export function CoHostPanel({
  journeys,
  incoming,
  outgoing,
}: {
  journeys: Array<{ id: string; title: string }>
  incoming: CoHostShareView[]
  outgoing: CoHostShareView[]
}) {
  const router = useRouter()
  const [planId, setPlanId] = useState(journeys[0]?.id ?? '')
  const [target, setTarget] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function run(task: () => Promise<ActionResult>, done: string | null) {
    if (pending) return
    start(async () => {
      setError(null)
      setNotice(null)
      const res = await task()
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNotice(done)
      router.refresh()
    })
  }

  const hasAnything = journeys.length > 0 || incoming.length > 0 || outgoing.length > 0
  if (!hasAnything) return null

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 text-subtle" aria-hidden />
        <h2 className="text-body-sm font-bold text-text">Co-host a Journey</h2>
      </div>
      <p className="mb-3 text-meta text-subtle">
        Invite another Space to co-host one of your Journeys. Once its team accepts, the Journey is listed on their Space and
        they are credited on its page. They can share it, they cannot edit it.
      </p>

      {incoming.length > 0 && (
        <ul className="mb-3 space-y-2">
          {incoming.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
              <span className="min-w-0 text-text">
                <span className="font-medium">{s.otherSpaceName}</span> invited you to co-host {s.planTitle}
                {s.status === 'accepted' ? ' (co-hosting)' : ''}
              </span>
              <span className="flex gap-2">
                {s.status === 'pending' ? (
                  <>
                    <Button type="button" size="sm" disabled={pending} onClick={() => run(() => acceptJourneyCoHost(s.id), 'Accepted. The Journey is now on your Space.')}>
                      Accept
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => declineJourneyCoHost(s.id), 'Declined.')}>
                      Decline
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => revokeJourneyCoHost(s.id), 'Co-hosting ended.')}>
                    Stop co-hosting
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {outgoing.length > 0 && (
        <ul className="mb-3 space-y-2">
          {outgoing.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
              <span className="min-w-0 text-text">
                {s.planTitle} with <span className="font-medium">{s.otherSpaceName}</span>
                <span className="text-subtle">{s.status === 'accepted' ? ' (co-hosting)' : ' (waiting for them to accept)'}</span>
              </span>
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => revokeJourneyCoHost(s.id), s.status === 'accepted' ? 'Co-hosting ended.' : 'Invite cancelled.')}>
                {s.status === 'accepted' ? 'End' : 'Cancel invite'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {journeys.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Journey" className="min-w-0 flex-1 basis-48">
            <Select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              aria-label="Journey to co-host"
              options={journeys.map((j) => ({ value: j.id, label: j.title }))}
            />
          </Field>
          <Field label="Space address" className="min-w-0 flex-1 basis-48">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="frequencylocal.com/spaces/their-space  or  their-space"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && planId && target.trim()) run(() => inviteJourneyCoHost({ planId, targetSlug: target }), 'Invite sent. Their team accepts it, then the Journey shows on their Space.')
              }}
            />
          </Field>
          <Button
            type="button"
            disabled={!planId || !target.trim() || pending}
            onClick={() => run(async () => {
              const res = await inviteJourneyCoHost({ planId, targetSlug: target })
              if (!isError(res)) setTarget('')
              return res
            }, 'Invite sent. Their team accepts it, then the Journey shows on their Space.')}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Users className="h-4 w-4" aria-hidden />}
            Invite
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-body-sm font-medium text-danger">{error}</p>}
      {notice && !error && <p className="mt-2 text-body-sm font-medium text-success">{notice}</p>}
    </section>
  )
}
