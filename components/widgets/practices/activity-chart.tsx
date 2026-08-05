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
  framed = true,
}: {
  activity: MemberActivity
  defaultView?: ActivityView
  /** Draw the surrounding card. TRUE on a page, where the chart is its own object. FALSE in
   *  the right rail, where the panel above it is already a titled group and a card here makes
   *  the rail a stack of boxes again — the exact thing "group, don't box" retires. The rail's
   *  panels went borderless without this, so the box simply moved one level down and the
   *  column still read as three different treatments in one column. */
  framed?: boolean
}) {
  const [view, setView] = useState<ActivityView>(defaultView)
  const bars = activity[view]
  const maxMin = Math.max(1, ...bars.map((b) => b.minutes))
  const totalMin = bars.reduce((s, b) => s + b.minutes, 0)
  const activeCount = bars.filter((b) => b.active).length
  const unit = UNIT[view]

  return (
    <div className={framed ? 'rounded-card border border-border bg-surface p-4' : ''}>
      {/* View toggle — Days · Weeks · Months.
          PATTERN: DAWN's right-rail segment (design_handoff/dawn/ui_kits/app/right-rail.jsx,
          the Activity module) is the direct reference — this is the same control in the same
          place. WHY not UnderlineTabs: this is a small in-panel segment that reshapes ONE
          chart in place, not page-level navigation between views, and an underline strip
          inside a rail panel would out-shout the panel's own title.
          The DAWN treatment is borderless text buttons with NO wrapper track: active =
          bg-surface-elevated + text-text + heavier weight on radius-control, inactive =
          transparent + text-subtle. The `bg-surface-elevated p-0.5` track this replaces is
          precisely what made it read as a pill group; DAWN carries no shadow here either,
          so the active state's `lift-1` goes with it. */}
      <div className="mb-3 inline-flex gap-0.5 text-meta">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            aria-pressed={view === v.key}
            className={`rounded-control px-2.5 py-1 transition-colors ${
              view === v.key
                ? 'bg-surface-elevated font-bold text-text'
                : 'font-semibold text-subtle hover:text-text'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mb-2.5 flex items-end justify-between gap-2">
        <span className="text-meta font-medium text-subtle">{PERIOD[view]}</span>
        <span className="text-body-sm font-semibold text-text">
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
                <div className="h-px w-full rounded-pill bg-border" />
              )}
            </div>
          )
        })}
      </div>

      {activity.streakLine && (
        <p className="mt-2.5 flex items-center gap-1.5 text-body-sm font-medium text-text">
          <Flame className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> {activity.streakLine}
        </p>
      )}
    </div>
  )
}
