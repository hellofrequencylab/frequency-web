'use client'

import { useState, useTransition } from 'react'
import { deleteAccountAction } from './actions'
import { isError } from '@/lib/action-result'

// Danger zone: permanent, self-serve account deletion (App Store requirement).
// Guarded by a type-to-confirm so it can't be triggered accidentally.
export function DeleteAccount() {
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const armed = confirm.trim().toUpperCase() === 'DELETE'

  return (
    <div className="rounded-xl border border-danger/40 bg-danger-bg/30 p-4">
      <h3 className="font-semibold text-text">Delete your account</h3>
      <p className="mt-1 text-sm text-muted">
        This permanently deletes your account and your content. It cannot be undone.
      </p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type DELETE to confirm"
          aria-label="Type DELETE to confirm"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-subtle"
        />
        <button
          disabled={!armed || pending}
          onClick={() =>
            start(async () => {
              const r = await deleteAccountAction()
              if (r && isError(r)) setErr(r.error)
            })
          }
          className="rounded-lg bg-danger text-white px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete account'}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  )
}
