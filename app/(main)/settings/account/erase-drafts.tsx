'use client'

import { useState, useTransition } from 'react'
import { eraseSparkDraftsAction } from '@/lib/studio/draft-actions'

// Danger zone: erase every staged Spark draft this member holds (LIVE-062). The per-draft bin
// lives on /drafts; this is the erase-ALL the draft-sync design reserved for Settings (the action's
// own doc: "Erase every staged draft this member holds, from Settings"), sitting beside the data
// export whose copy names the member's unfinished drafts. Mirrors the delete-account row's shape:
// same card, same type-to-confirm guard, so a destructive control here always reads the same way.
//
// The action self-scopes to the session (it can only touch the caller's own rows) and swallows its
// failures into a 0, so the done line stays plain rather than promising an error we cannot see.
export function EraseDrafts() {
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const armed = confirm.trim().toUpperCase() === 'ERASE'

  return (
    <div className="rounded-xl border border-danger/40 bg-danger-bg/30 p-4">
      <h3 className="font-semibold text-text">Erase your saved drafts</h3>
      <p className="mt-1 text-body-sm text-muted">
        This erases the unfinished drafts you typed into a builder and saved for later, on every
        device you use. Anything you already created stays, and so do the events you captured. It
        cannot be undone.
      </p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type ERASE to confirm"
          aria-label="Type ERASE to confirm"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-body-sm text-text placeholder:text-subtle"
        />
        <button
          disabled={!armed || pending}
          onClick={() =>
            start(async () => {
              setDone(null)
              const n = await eraseSparkDraftsAction()
              setConfirm('')
              setDone(
                n > 0 ? `Erased ${n} draft${n === 1 ? '' : 's'}.` : 'Nothing to erase right now.',
              )
            })
          }
          className="rounded-control bg-danger text-on-danger px-4 py-1.5 text-body-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Erasing…' : 'Erase drafts'}
        </button>
      </div>
      {done && (
        <p className="mt-2 text-meta text-muted" role="status">
          {done}
        </p>
      )}
    </div>
  )
}
