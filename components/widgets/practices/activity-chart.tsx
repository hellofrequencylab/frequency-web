'use client'

import { useState } from 'react'
import { Flame } from 'lucide-react'
import type { MemberActivity, ActivityView } from '@/lib/practice-activity'

// "Your activity" — an Insight-Timer-style bar chart with a Days / Weeks / Months toggle (the three
// series are precomputed server-side, so flipping views is instant, no refetch). Same footprint in
// every view: a fixed-height bar row whose heights are MINUTES practiced, an active-but-untimed
// period gets a short floor bar, and an empty one a faint baseline tick. Used by the practices page
// block AND the right-rail panel.

const VIEWS: { key: ActivityView; label: string }[] = [
  { key: 'days', label: 'Days' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'months', label: 'Months' },
]
const PERIOD: Record<ActivityView, string> = {
  days: 'Last 14 days',
  weeks: 'Last 10 weeks',
  months: 'Last 6 months',
}
const UNIT: Record<ActivityView, string> = { days: 'day', weeks: 'week', months: 'month' }

export function ActivityChart({
  activity,
  defaultView = 'days',
}: {
  activity: MemberActivity
  defaultView?: ActivityView
}) {
  const [view, setView] = useState<ActivityView>(defaultView)
  const bars = activity[view]
  const maxMin = Math.max(1, ...bars.map((b) => b.minutes))
  const totalMin = bars.reduce((s, b) => s + b.minutes, 0)
  const activeCount = bars.filter((b) => b.active).length
  const unit = UNIT[view]

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      {/* View toggle — Days · Weeks · Months. */}
      <div className="mb-3 inline-flex rounded-lg bg-surface-elevated p-0.5 text-xs font-medium">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            aria-pressed={view === v.key}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              view === v.key ? 'bg-surface text-text shadow-sm' : 'text-subtle hover:text-text'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mb-2.5 flex items-end justify-between gap-2">
        <span className="text-xs font-medium text-subtle">{PERIOD[view]}</span>
        <span className="text-sm font-semibold text-text">
          {activeCount} {activeCount === 1 ? unit : `${unit}s`}
          {totalMin > 0 ? <span className="font-normal text-muted"> · {totalMin} min</span> : null}
        </span>
      </div>

      {/* Fixed-height bar row (same in every view). Height = minutes; a logged-but-untimed period
          gets a short bar; an empty one a faint baseline tick. */}
      <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={`Practice activity, ${PERIOD[view]}`}>
        {bars.map((b) => {
          const pct = b.minutes > 0 ? Math.min(100, Math.max(20, Math.round((b.minutes / maxMin) * 100))) : b.active ? 16 : 0
          return (
            <div
              key={b.key}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${b.label}${b.minutes > 0 ? ` · ${b.minutes} min` : b.active ? ' · practiced' : ''}`}
            >
              {pct > 0 ? (
                <div className={`w-full rounded-sm ${b.minutes > 0 ? 'bg-primary' : 'bg-primary/45'}`} style={{ height: `${pct}%` }} />
              ) : (
                <div className="h-px w-full rounded-full bg-border" />
              )}
            </div>
          )
        })}
      </div>

      {activity.streakLine && (
        <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-text">
          <Flame className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> {activity.streakLine}
        </p>
      )}
    </div>
  )
}
