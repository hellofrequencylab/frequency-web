'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

// Shared "danger zone" delete control for the entity settings modules (circle, event,
// practice). Two-step confirm, runs the passed server action, surfaces its {error},
// and on success navigates away (the entity no longer exists). The server action is the
// authority — it re-checks the manage capability; this is only the affordance.
export function DangerDelete({
  entity,
  warning,
  onDelete,
  redirectTo,
}: {
  /** The member-facing noun, e.g. "circle". */
  entity: string
  /** One plain line on what deleting does (shown before confirm). */
  warning: string
  /** The server action. Returns `{ error }` on failure, or void/anything on success. */
  onDelete: () => Promise<{ error?: string } | void>
  /** Where to go once it's gone. */
  redirectTo: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run() {
    setErr(null)
    start(async () => {
      const res = await onDelete()
      if (res && typeof res === 'object' && 'error' in res && res.error) {
        setErr(res.error)
        return
      }
      router.push(redirectTo)
    })
  }

  return (
    <div className="mt-6 rounded-2xl border border-danger/30 bg-danger-bg/20 p-4">
      <p className="text-sm font-semibold text-danger">Delete this {entity}</p>
      <p className="mt-0.5 text-xs text-muted">{warning}</p>
      {err && <p className="mt-1.5 text-xs font-medium text-danger">{err}</p>}
      <div className="mt-2.5">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg/40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete {entity}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-danger">This can’t be undone.</span>
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setErr(null) }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
