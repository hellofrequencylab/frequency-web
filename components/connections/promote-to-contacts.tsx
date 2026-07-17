'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookUser, Check, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'
import { promoteToContacts } from '@/app/(main)/connections/actions'
import { promotionState, type PromotionState } from '@/lib/connections/promote'

// The member-facing, consent-gated promotion of a personal capture into the shared
// Frequency contacts DB (ADR-742, riding ADR-099/154). Two-step by design: the button
// opens a plain confirmation that states exactly what happens before anything is written.
// The person is added as an UNCONFIRMED lead and is never emailed until they opt in, and
// your private notes and tags stay with you. Idempotent: once linked it shows the state
// with no action.

export function PromoteToContacts({
  contactId,
  name,
  linkedContactId,
  email,
}: {
  contactId: string
  name: string
  linkedContactId: string | null
  email: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Optimistically flip to linked after a successful promote so the panel settles
  // without waiting on the refresh (the server row is already linked either way).
  const [justLinked, setJustLinked] = useState(false)

  const state: PromotionState = justLinked
    ? 'linked'
    : promotionState({ linkedContactId, email })

  function confirm() {
    setError(null)
    start(async () => {
      const res = await promoteToContacts(contactId)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      setConfirming(false)
      setJustLinked(true)
      router.refresh()
    })
  }

  if (state === 'linked') {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-1.5 text-sm font-medium text-success">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> In Frequency contacts
      </p>
    )
  }

  if (state === 'needs_email') {
    return (
      <p className="text-sm text-subtle">
        Add an email in Edit to add {name} to Frequency contacts. Contacts are matched by email address.
      </p>
    )
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-subtle">
          Add {name} to the shared Frequency contacts database as an unconfirmed lead. They stay in your
          private book too.
        </p>
        <button
          type="button"
          onClick={() => { setError(null); setConfirming(true) }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <BookUser className="h-4 w-4" aria-hidden /> Add to Frequency contacts
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-strong bg-surface-elevated/50 p-4">
      <p className="text-sm font-semibold text-text">Add {name} to Frequency contacts?</p>
      <ul className="space-y-1.5 text-sm text-muted">
        <li className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          They join the shared contacts database as an unconfirmed lead.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          They are not emailed, and cannot be emailed, until they confirm their address or sign up
          themselves.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          Your private notes and tags stay with you. They are never shared.
        </li>
      </ul>
      {error && (
        <p className="inline-flex items-center gap-1 text-xs text-danger">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BookUser className="h-4 w-4" aria-hidden />}
          Add to contacts
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null) }}
          disabled={pending}
          className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
