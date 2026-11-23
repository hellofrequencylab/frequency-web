'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { monthWeeks, openMonthRange, type SlotDay } from '@/lib/spaces/booking-format'
import { cn } from '@/lib/utils'

// BOOKING MONTH GRID (BOOK-013, client). The picker leads with a month calendar instead of every open
// time in the window: days with open times are marked and tappable, the rest are plain numbers, and the
// picker shows only the chosen day's times. Paging runs from the first open month to the last, which is
// the booking window (the slots already stop there). Controlled: the picker owns the chosen day.
//
// Day keys are local dates in the VIEWER's zone (groupSlotsByDay), so the grid is pure calendar math
// and the labels format each key as a UTC date to land on the same calendar day. Tokens only, no hex.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const DAY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })

function keyDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d ?? 1))
}

export function BookingMonthGrid({
  days,
  selectedKey,
  onSelect,
}: {
  /** The open days (local YYYY-MM-DD keys in the viewer's zone), ascending. */
  days: SlotDay[]
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  const months = useMemo(() => openMonthRange(days), [days])
  const open = useMemo(() => new Map(days.map((d) => [d.key, d.slots.length])), [days])
  // Null follows the chosen day's month; paging pins a month. A refresh can drop a pinned month out of
  // range (its last open time was just booked), so an out-of-range month falls back too.
  const [paged, setPaged] = useState<string | null>(null)
  const fallback = selectedKey?.slice(0, 7) ?? months[0] ?? null
  const shown = paged && months.includes(paged) ? paged : fallback
  if (!shown) return null
  const at = months.indexOf(shown)
  const monthLabel = MONTH_FMT.format(keyDate(shown))

  function page(step: number) {
    const next = months[at + step]
    if (!next) return
    setPaged(next)
    // Land on the month's first open day, so the times below match the month on screen.
    const first = days.find((d) => d.key.startsWith(next))
    if (first) onSelect(first.key)
  }

  return (
    <div className="rounded-card border border-border bg-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <IconButton label="Previous month" onClick={() => page(-1)} disabled={at <= 0}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </IconButton>
        <h3 className="text-body-sm font-bold tracking-tight text-text" aria-live="polite">
          {monthLabel}
        </h3>
        <IconButton label="Next month" onClick={() => page(1)} disabled={at < 0 || at >= months.length - 1}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
      <div role="group" aria-label={`Days in ${monthLabel}`} className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} aria-hidden className="py-1 text-center text-2xs font-semibold uppercase text-muted">
            {w}
          </span>
        ))}
        {monthWeeks(shown)
          .flat()
          .map((key, i) => {
            if (!key) return <span key={`pad-${i}`} aria-hidden />
            const count = open.get(key) ?? 0
            const active = count > 0 && key === selectedKey
            const label = DAY_FMT.format(keyDate(key))
            return (
              <button
                key={key}
                type="button"
                disabled={count === 0}
                onClick={() => onSelect(key)}
                aria-pressed={count > 0 ? active : undefined}
                aria-label={
                  count > 0 ? `${label}, ${count} open ${count === 1 ? 'time' : 'times'}` : `${label}, no open times`
                }
                className={cn(
                  'flex h-10 items-center justify-center rounded-control text-body-sm tabular-nums transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  count === 0 && 'text-subtle',
                  count > 0 && !active && 'bg-primary-bg font-semibold text-primary-strong hover:bg-primary-bg/70',
                  active && 'bg-primary font-bold text-on-primary',
                )}
              >
                {Number(key.slice(8))}
              </button>
            )
          })}
      </div>
    </div>
  )
}
