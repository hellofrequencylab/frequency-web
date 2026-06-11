'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Banner, StatusChip } from '@/components/admin/status'
import { StatCard } from '@/components/ui/stat-card'

import { setDemoMode } from './actions'

// Dashboard overview — the at-a-glance state of the demo layer + the one global switch
// that shows/hides it everywhere. Counts come from the server (page.tsx). The switch
// autosaves with an inline "Saved" (ADR-233 §5 save semantics).
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
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)
    setSaved(false)
    start(async () => {
      try {
        await setDemoMode(next)
        router.refresh()
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (e) {
        setOn(!next)
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <Banner tone="critical" title="Could not save">
          {error}
        </Banner>
      )}

      {/* Global visibility switch */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusChip tone={on ? 'success' : 'neutral'} size="sm">
              {on ? 'Visible' : 'Hidden'}
            </StatusChip>
            <p className="text-sm font-semibold text-text">
              {on ? 'Demo content is live across the app' : 'Demo content is hidden everywhere'}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted">
            {on
              ? 'Visible across the directory, circles, events, and feeds. The ⚡ marks it as sample content.'
              : 'The rows still exist. Flip back on any time, or purge them for good in the Danger zone below.'}
          </p>
          <p className="mt-1 flex min-h-4 items-center gap-1.5 text-xs">
            {pending && (
              <span className="inline-flex items-center gap-1.5 text-subtle">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            )}
            {!pending && saved && (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Show demo content"
          onClick={toggle}
          disabled={pending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 motion-reduce:transition-none ${
            on ? 'bg-primary' : 'bg-border-strong'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform motion-reduce:transition-none ${
              on ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* At-a-glance counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard bordered label="total demo rows" value={total.toLocaleString()} />
        {counts.map((c) => (
          <StatCard key={c.label} bordered label={c.label} value={c.count.toLocaleString()} />
        ))}
      </div>
    </div>
  )
}
