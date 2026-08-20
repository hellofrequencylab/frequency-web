'use client'

// "Ask to host this event" — the SPACE side of the ADR-911 host handshake, the half that had a
// server action (`requestEventHost`) and no render path. The event side (offer / accept / decline /
// revoke) lives in the settings rail (event-host-offer-field.tsx); this is the mirror for someone
// who runs a Space and is looking at an event their business actually runs — the venue posted it,
// so they cannot reach that rail. Asking never moves anything by itself: the current host has to
// accept, because the host is giving up the money.
//
// The server page only mounts this for a signed-in viewer whose Spaces pass the action's own gate
// (`listSpacesThatCanAskToHost`, which mirrors `requestEventHost`), and the action re-enforces every
// rule on submit — this leaf is UX only. Modeled on ClaimRequestCta beside it: the smallest possible
// client island, a pending state, and the action's refusal string surfaced verbatim.

import { useState, useTransition } from 'react'
import { Check, Crown, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { fieldClasses } from '@/components/ui/field'
import { requestEventHost, type HostAskSpace } from '@/app/(main)/events/host-transfer-actions'

export function HostRequestCta({ eventId, spaces }: { eventId: string; spaces: HostAskSpace[] }) {
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? '')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onAsk() {
    if (pending || !spaceId) return
    start(async () => {
      setError(null)
      const res = await requestEventHost(eventId, spaceId)
      if (isError(res)) setError(res.error)
      else setSent(true)
    })
  }

  if (spaces.length === 0) return null

  return (
    <div className="mb-5 rounded-2xl border border-border bg-surface px-5 py-4">
      <p className="flex items-center gap-1.5 text-body font-bold text-text">
        <Crown className="h-4 w-4 shrink-0 text-primary" aria-hidden /> Does your Space run this event?
      </p>

      {sent ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-body-sm font-semibold text-success">
          <Check className="h-4 w-4" aria-hidden /> Asked. The current host decides, and you&rsquo;ll hear
          either way.
        </p>
      ) : !confirming ? (
        <>
          <p className="mt-1 text-body-sm text-muted">
            You can ask to host it. Hosting means registrations and ticket payments run through your
            Space, and the current host has to agree first.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Ask to host
          </button>
        </>
      ) : (
        <div className="mt-2">
          {/* Naming the consequence at the point of the click, like the accept side does: hosting is
              a money change, not a credit line. */}
          <p className="text-body-sm text-muted">
            Hosting means registrations and ticket payments run through your Space, and refunds are
            yours to issue. The current host has to accept before anything changes.
          </p>
          {spaces.length > 1 && (
            <label className="mt-3 block max-w-xs">
              <span className="text-meta font-medium text-muted">Ask as</span>
              <select
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                disabled={pending}
                className={`${fieldClasses} mt-1 block w-full text-body-sm`}
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onAsk}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {pending ? 'Sending' : 'Send the ask'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-control border border-border px-4 py-2.5 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
            >
              Cancel
            </button>
            {error && <span className="text-body-sm text-danger">{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
