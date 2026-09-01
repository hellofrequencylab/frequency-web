'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CalendarRepeatSeries } from '@/lib/events/calendar-repeats'

// The Repeats strip that sits between the month header and the month grid (LIVE-081). One CHIP per
// series, never a bare icon: a member cannot tell what an unlabelled marker is without clicking it,
// so every chip carries the series name AND how often it lands ("Breathe Connect Expand ·
// Thursdays"). Two targets per chip, which is the whole interaction:
//
//   · the NAME is a link and opens the next date of that series;
//   · the CADENCE is a toggle and highlights that series' dates in the grid.
//
// The toggle HIGHLIGHTS. It does not filter the grid and it hides nothing: everything visible with
// the strip untouched is still visible with a chip pressed. That is why this is a plain
// `aria-pressed` button rather than a filter control.
//
// The name is a Link and the cadence is a button, side by side inside the pill, because a link
// nested inside a button is invalid and only one of the two would ever fire.

export function CalendarRepeatsStrip({
  series,
  activeKey,
  onToggle,
}: {
  series: CalendarRepeatSeries[]
  /** The series currently highlighted, or null. */
  activeKey: string | null
  onToggle: (key: string) => void
}) {
  if (series.length === 0) return null
  const anyPending = series.some((s) => s.pendingDayKeys.length > 0)

  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Repeats</span>
        {series.map((s) => {
          const on = s.key === activeKey
          return (
            <span
              key={s.key}
              className={cn(
                'inline-flex items-stretch overflow-hidden rounded-pill border transition-colors',
                on ? 'border-primary bg-primary/10' : 'border-border bg-surface-elevated',
              )}
            >
              {s.href ? (
                <Link
                  href={s.href}
                  className="max-w-40 block truncate px-2.5 py-1 text-2xs font-semibold text-text underline-offset-2 hover:underline"
                >
                  {s.name}
                </Link>
              ) : (
                <span className="max-w-40 truncate px-2.5 py-1 text-2xs font-semibold text-text">{s.name}</span>
              )}
              <button
                type="button"
                onClick={() => onToggle(s.key)}
                aria-pressed={on}
                // The visible word is the cadence, so it leads the accessible name (WCAG 2.5.3)
                // and the rest says what pressing it does.
                aria-label={`${s.cadenceLabel}, highlight ${s.name} dates on the calendar`}
                className={cn(
                  'border-l px-2.5 py-1 text-2xs font-medium transition-colors',
                  on
                    ? 'border-primary bg-primary/10 text-primary-strong'
                    : 'border-border text-muted hover:bg-surface hover:text-text',
                )}
              >
                {s.cadenceLabel}
              </button>
            </span>
          )
        })}
      </div>
      {anyPending && (
        <p className="text-meta text-subtle">
          A hollow dot is a date that is set but not open yet. Those dates open for RSVP about two months ahead.
        </p>
      )}
    </div>
  )
}
