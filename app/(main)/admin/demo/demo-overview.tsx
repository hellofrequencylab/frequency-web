'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setDemoMode } from './actions'

// Dashboard overview — the at-a-glance state of the demo layer + the one global
// switch that shows/hides it everywhere. Counts come from the server (page.tsx).
export function DemoOverview({
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
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)
    start(async () => {
      try {
        await setDemoMode(next)
        router.refresh()
      } catch (e) {
        setOn(!next)
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {/* Global visibility switch */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                on ? 'bg-success-bg text-success' : 'bg-surface-elevated text-subtle'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-success' : 'bg-subtle'}`} />
              {on ? 'Visible' : 'Hidden'}
            </span>
            <p className="text-sm font-semibold text-text">
              {on ? 'Demo content is live across the app' : 'Demo content is hidden everywhere'}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted">
            {on
              ? 'Visible across the directory, circles, events, and feeds — the ⚡ marks it as sample content.'
              : 'The rows still exist. Flip back on any time, or purge them for good in the Danger zone below.'}
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
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform ${
              on ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* At-a-glance counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-primary-bg bg-primary-bg/30 p-4">
          <p className="text-2xl font-bold tabular-nums text-text">{total.toLocaleString()}</p>
          <p className="mt-0.5 text-xs font-medium text-primary-strong">total demo rows</p>
        </div>
        {counts.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-2xl font-bold tabular-nums text-text">{c.count.toLocaleString()}</p>
            <p className="mt-0.5 text-xs text-muted">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
