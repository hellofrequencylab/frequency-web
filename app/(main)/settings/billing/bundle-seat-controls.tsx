'use client'

// The interactive leaves of the Household bundle seat manager (ADR-370). Each one is a thin
// client wrapper over a server action in ./bundle-actions.ts: the authority lives there, resolved
// from the session, so nothing here can be talked into seating anybody.
//
// Composed from the kit (components/ui): Button for every control, Field + Input for the one text
// entry. No hand-rolled control chrome, no literal type or radius steps.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Field, Input } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { inviteToBundleSeat, revokeBundleSeatOffer, answerBundleSeatOffer } from './bundle-actions'

/** Offer a seat, addressed by @handle. A seat lands on a profile, so the address is the handle
 *  that names one. */
export function InviteToSeatForm({ seatsOpen }: { seatsOpen: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  function send(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSent(null)
    const asked = handle.trim()
    start(async () => {
      const r = await inviteToBundleSeat(asked)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setHandle('')
      setSent(`Invite sent to ${asked.startsWith('@') ? asked : `@${asked}`}.`)
      router.refresh()
    })
  }

  if (seatsOpen <= 0) return null

  return (
    <form onSubmit={send} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Invite by handle" className="flex-1" hint="They take the seat when they accept.">
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@handle"
          autoComplete="off"
          disabled={pending}
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <Button type="submit" loading={pending} disabled={handle.trim().length === 0} className="shrink-0">
        Send invite
      </Button>
      <span aria-live="polite" className="sr-only">
        {error ?? sent ?? ''}
      </span>
      {(error || sent) && (
        <p className={`text-body-sm sm:basis-full ${error ? 'text-danger' : 'text-success'}`}>{error ?? sent}</p>
      )}
    </form>
  )
}

/** Withdraw an offer nobody has answered. Owner-only, enforced server side. */
export function RevokeSeatOfferButton({ inviteId }: { inviteId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await revokeBundleSeatOffer(inviteId)
            if (isError(r)) setError(r.error)
            else router.refresh()
          })
        }
      >
        Withdraw
      </Button>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}

/** Take the seat, or turn it down. Invitee-only, enforced server side and again inside the
 *  seating transaction. */
export function AnswerSeatOfferButtons({ inviteId }: { inviteId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function answer(action: 'accept' | 'decline') {
    setError(null)
    start(async () => {
      const r = await answerBundleSeatOffer(inviteId, action)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" loading={pending} onClick={() => answer('decline')}>
          No thanks
        </Button>
        <Button size="sm" loading={pending} onClick={() => answer('accept')}>
          Take the seat
        </Button>
      </div>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}
