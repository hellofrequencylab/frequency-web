'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

// Shared "danger zone" delete control for the entity settings modules (circle, event,
// practice). Two-step confirm, runs the passed server action, surfaces its {error},
// and on success navigates away (the entity no longer exists). The server action is the
// authority — it re-checks the manage capability; this is only the affordance.
//
// confirmText (optional): when set, the confirm step adds a text input and the
// destructive button stays disabled until the typed value EXACTLY equals it
// (case-sensitive) — e.g. typing DELETE. Omit it for the plain two-step confirm
// (backward-compatible). chromeless drops this control's own danger box so a caller
// can nest it inside a shared bordered box (the event Cancel + Delete box).
export function DangerDelete({
  entity,
  warning,
  onDelete,
  redirectTo,
  confirmText,
  chromeless = false,
}: {
  /** The member-facing noun, e.g. "circle". */
  entity: string
  /** One plain line on what deleting does (shown before confirm). */
  warning: string
  /** The server action. Returns `{ error }` on failure, or void/anything on success. */
  onDelete: () => Promise<{ error?: string } | void>
  /** Where to go once it's gone. */
  redirectTo: string
  /** Require the user to type this exact string before delete enables (case-sensitive). */
  confirmText?: string
  /** Drop the bordered danger box (for nesting inside a shared box). */
  chromeless?: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Case-sensitive exact match. No confirmText ⇒ always satisfied (plain two-step).
  const matched = !confirmText || typed === confirmText

  function run() {
    if (!matched) return
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

  function reset() {
    setConfirming(false)
    setTyped('')
    setErr(null)
  }

  const body = (
    <>
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
          <div className="space-y-2">
            <span className="block text-xs font-medium text-danger">This can’t be undone.</span>
            {confirmText && (
              <label className="block space-y-1">
                <span className="block text-xs text-muted">
                  Type <span className="font-semibold text-text">{confirmText}</span> to confirm.
                </span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  aria-label={`Type ${confirmText} to confirm deletion`}
                  className="w-40 rounded-lg border border-danger/40 bg-surface px-2.5 py-1.5 text-xs text-text outline-none focus:border-danger"
                />
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={run}
                disabled={pending || !matched}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Yes, delete
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )

  if (chromeless) return <div>{body}</div>

  return <div className="mt-6 rounded-2xl border border-danger/30 bg-danger-bg/20 p-4">{body}</div>
}
