'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { buttonClasses } from '@/components/ui/button'
import { timelineMonthLabel } from '@/lib/calendar/admin-views'
import { adjacentMonth } from '@/lib/calendar/month-window'
import type { TimelineBar, TimelineDay } from '@/lib/calendar/month-timeline'
import { cn } from '@/lib/utils'

// TIMELINE VIEW (ADR-1464, ADR-1467). One month as a linear time scale. Days on
// the X axis, one row per gathering. Month steps stay in the client shell.

export function CalendarTimelineView({
  year,
  month1,
  days,
  bars,
  onMonthChange,
  loading = false,
}: {
  year: number
  month1: number
  days: TimelineDay[]
  bars: TimelineBar[]
  onMonthChange: (year: number, month1: number) => void
  loading?: boolean
}) {
  const prev = adjacentMonth(year, month1, -1)
  const next = adjacentMonth(year, month1, 1)
  const columns = `repeat(${days.length}, minmax(2.75rem, 1fr))`

  return (
    <div className="space-y-4" data-calendar-timeline-view>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SectionHeader title={timelineMonthLabel(year, month1)} count={bars.length} />
          {loading ? <span className="text-meta text-muted">Loading…</span> : null}
        </div>
        <nav aria-label="Timeline month" className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(prev.year, prev.month1)}
            className={buttonClasses('secondary', 'sm')}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(next.year, next.month1)}
            className={buttonClasses('secondary', 'sm')}
          >
            Next
          </button>
        </nav>
      </div>

      {bars.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="Nothing in this month."
          description="Move to another month, or pencil a date on the Admin view."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <div className="min-w-[48rem] p-3">
            <div className="grid gap-px" style={{ gridTemplateColumns: columns }} role="row">
              {days.map((day) => (
                <div
                  key={day.dayKey}
                  role="columnheader"
                  className={cn(
                    'px-0.5 py-1 text-center',
                    day.isToday && 'rounded-control bg-primary-bg text-primary-strong',
                  )}
                >
                  <span className="block text-meta font-semibold text-muted">{day.weekday}</span>
                  <span className="block text-body-sm font-bold tabular-nums">{day.day}</span>
                </div>
              ))}
            </div>
            <ol className="mt-3 space-y-2">
              {bars.map((bar) => {
                const inner = (
                  <span
                    className={cn(
                      'block truncate rounded-control px-2 py-1 text-meta font-semibold',
                      bar.isCancelled
                        ? 'bg-surface-elevated text-muted line-through'
                        : 'bg-primary/15 text-primary-strong',
                    )}
                  >
                    {bar.title}
                    <span className="ml-2 font-medium text-muted">{bar.timeLabel}</span>
                  </span>
                )
                return (
                  <li key={bar.key} className="grid items-center gap-px" style={{ gridTemplateColumns: columns }}>
                    <div
                      className="min-w-0"
                      style={{ gridColumn: `${bar.startCol} / span ${bar.span}` }}
                      title={`${bar.title}. ${bar.whenLabel}. ${bar.stageLabel}.`}
                    >
                      {bar.href ? (
                        <Link href={bar.href} className="block min-w-0 hover:opacity-90">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
