'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banner, StatusChip } from '@/components/admin/status'
import { StatCard } from '@/components/ui/stat-card'
import { Toggle } from '@/components/admin/toggle'

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

  function toggle(next: boolean) {
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
        </div>
        <Toggle
          checked={on}
          onChange={toggle}
          ariaLabel="Show demo content"
          disabled={pending}
          saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
        />
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
