'use client'

import { useState, useTransition } from 'react'
import { deleteAccountAction } from './actions'
import { isError } from '@/lib/action-result'
import type { SpacePlanEndedByDelete } from '@/lib/account'

// Danger zone: permanent, self-serve account deletion (App Store requirement).
// Guarded by a type-to-confirm so it can't be triggered accidentally.
//
// `paidSpaces` (LIVE-628, ADR-1601) is read on the server by paidSpacesEndedByDelete: the Spaces
// whose paid plan is billed to this member's Stripe customer. Deleting the account deletes that
// customer (ADR-1581), which cancels the plan, so they are named here BEFORE the confirm. An empty
// list shows nothing; null (the read failed) shows the same warning in general terms.
export function DeleteAccount({ paidSpaces = [] }: { paidSpaces?: SpacePlanEndedByDelete[] | null }) {
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const armed = confirm.trim().toUpperCase() === 'DELETE'

  return (
    <div className="rounded-xl border border-danger/40 bg-danger-bg/30 p-4">
      <h3 className="font-semibold text-text">Delete your account</h3>
      <p className="mt-1 text-body-sm text-muted">
        This permanently deletes your account and your content. It cannot be undone.
      </p>
      <PaidSpacesNote paidSpaces={paidSpaces} />
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type DELETE to confirm"
          aria-label="Type DELETE to confirm"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-body-sm text-text placeholder:text-subtle"
        />
        <button
          disabled={!armed || pending}
          onClick={() =>
            start(async () => {
              const r = await deleteAccountAction()
              if (r && isError(r)) setErr(r.error)
            })
          }
          className="rounded-control bg-danger text-on-danger px-4 py-1.5 text-body-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete account'}
        </button>
      </div>
      {err && <p className="mt-2 text-meta text-danger">{err}</p>}
    </div>
  )
}

function PaidSpacesNote({ paidSpaces }: { paidSpaces: SpacePlanEndedByDelete[] | null }) {
  if (paidSpaces && paidSpaces.length === 0) return null
  return (
    <div
      data-paid-spaces-warning
      className="mt-3 rounded-control border border-warning/40 bg-warning-bg/30 px-3 py-2 text-body-sm text-text"
    >
      <p className="font-semibold">
        {paidSpaces && paidSpaces.length > 1 ? 'This also ends paid Space plans' : 'This also ends a paid Space plan'}
      </p>
      {paidSpaces === null ? (
        <p className="mt-1 text-muted">
          If your account pays for a Space&rsquo;s plan, deleting it cancels that plan too. The Space stays and
          goes back to Free.
        </p>
      ) : paidSpaces.length === 1 ? (
        <p className="mt-1 text-muted">
          Your account pays for the {paidSpaces[0].plan} plan on {paidSpaces[0].name}. Deleting your account
          cancels it. The Space stays and goes back to Free.
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted">
            Your account pays for the plans on these Spaces. Deleting your account cancels all of them. Each
            Space stays and goes back to Free.
          </p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {paidSpaces.map((s, i) => (
              <li key={`${i}-${s.name}`}>
                {s.name}, {s.plan} plan
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
