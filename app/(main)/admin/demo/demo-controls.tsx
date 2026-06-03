'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { setDemoMode, purgeDemoContent } from './actions'

export function DemoControls({
  enabled,
  counts,
  total,
}: {
  enabled: boolean
  counts: { label: string; count: number }[]
  total: number
}) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next) // optimistic
    setError(null)
    startTransition(async () => {
      try {
        await setDemoMode(next)
        router.refresh()
      } catch (e) {
        setOn(!next)
        setError(e instanceof Error ? e.message : 'Failed to update the switch.')
      }
    })
  }

  function purge() {
    setError(null)
    startTransition(async () => {
      try {
        await purgeDemoContent()
        setConfirm('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Purge failed.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {/* Soft switch */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Show demo content</p>
          <p className="mt-0.5 text-sm text-muted">
            {on
              ? 'Demo content is visible across the directory, circles, events, and feeds.'
              : 'Demo content is hidden everywhere. The rows still exist — flip back on, or purge below.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Show demo content"
          onClick={toggle}
          disabled={pending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            on ? 'bg-primary' : 'bg-border-strong'
          }`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Danger zone — permanent purge */}
      <div className="rounded-2xl border border-danger-bg bg-danger-bg/10 p-5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Purge all demo content</p>
            <p className="mt-0.5 text-sm text-muted">
              Permanently deletes the {total.toLocaleString()} demo {total === 1 ? 'row' : 'rows'} below
              (and their reactions, memberships, and RSVPs). This cannot be undone — use it once real
              content has taken over.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
              {counts.map((c) => (
                <li key={c.label}>
                  <span className="font-semibold tabular-nums text-text">{c.count}</span> {c.label}
                </li>
              ))}
            </ul>

            {total > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted" htmlFor="purge-confirm">
                  Type <span className="font-mono font-semibold text-danger">PURGE</span> to confirm:
                </label>
                <input
                  id="purge-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-28 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-danger focus:outline-none"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={purge}
                  disabled={confirm !== 'PURGE' || pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Purge demo content
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
