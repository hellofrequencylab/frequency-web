'use client'

import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { monthLabel, SHORT_MONTH_LABELS } from '@/lib/events/calendar-grid'
import { monthKey } from '@/lib/calendar/month-window'
import { CALENDAR_LAYERS, type CalendarLayerKey } from '@/lib/calendar/registry'
import { cn } from '@/lib/utils'

// THE GRID'S CHROME, DRAWN IN TWO PLACES (LIVE-485, owner ask 2026-09-23: "condense all sorting and
// controls into an intuitive header bar"). The month-and-year jump, the grid / list switcher and
// the layer chips used to be band after band INSIDE the grid body, which is the second row of
// controls the owner was looking at. They now live in the Calendar console's one header bar, and
// they stay in the grid's own header on the page, where nothing else draws them.
//
// 🔴 THEY ARE DEFINED ONCE, HERE, for the reason LIVE-475 exists: the first time the console took
// chrome off the grid, it took two controls no host drew and shipped a reachable dead end. A
// control written out twice drifts, and a drifted control is that bug again with more steps.
// `calendarChrome()` in lib/events/calendar-grid.ts says WHO draws each of these; this file is WHAT
// gets drawn. Both sites pass the same state in and get the same accessible names out.

/** The month grid versus the same calendar as a chronological list. NOT the workspace's four-panel
 *  Guest / Calendar / List / Workflow toggle, which is a different control over a different set. */
export function CalendarViewSwitch({
  view,
  onView,
  className,
}: {
  view: 'grid' | 'list'
  onView: (next: 'grid' | 'list') => void
  className?: string
}) {
  return (
    <div
      className={cn('inline-flex items-center rounded-control border border-border p-0.5', className)}
      role="group"
      aria-label="Calendar view"
    >
      <IconButton label="Grid view" variant={view === 'grid' ? 'filled' : 'plain'} onClick={() => onView('grid')} aria-pressed={view === 'grid'}>
        <LayoutGrid className="h-4 w-4" aria-hidden />
      </IconButton>
      <IconButton label="List view" variant={view === 'list' ? 'filled' : 'plain'} onClick={() => onView('list')} aria-pressed={view === 'list'}>
        <List className="h-4 w-4" aria-hidden />
      </IconButton>
    </div>
  )
}

/** What shows on the calendar: Events, In the works, Private, Unavailable, To-dos. A pressed chip
 *  is showing; pressing it again hides that layer. Shown where two or more layers are offered. */
export function CalendarLayerChips({
  layers,
  hidden,
  onToggle,
  className,
}: {
  layers: readonly CalendarLayerKey[]
  hidden: ReadonlySet<CalendarLayerKey>
  onToggle: (key: CalendarLayerKey) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="group" aria-label="Show on the calendar">
      {CALENDAR_LAYERS.filter((l) => layers.includes(l.key)).map((l) => {
        const on = !hidden.has(l.key)
        return (
          <button
            key={l.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(l.key)}
            className={cn(
              'tap-target rounded-pill border px-3 py-1 text-meta font-medium transition-colors',
              on ? cn('border-transparent', l.chipClass) : 'border-border text-muted hover:text-text',
            )}
          >
            {l.label}
          </button>
        )
      })}
    </div>
  )
}

/** Twelve months of one year, each marked when the caller says it holds something. The panel only;
 *  the trigger that opens it, and where focus lands when it closes, belong to the site that draws
 *  it, because the grid hangs it on its month title and the console header hangs it on its own. */
export function MonthJumpPanel({
  shownYear,
  shownMonth1,
  jumpYear,
  onJumpYear,
  countFor,
  onPick,
  className,
}: {
  shownYear: number
  shownMonth1: number
  jumpYear: number
  onJumpYear: (next: number) => void
  /** How many items that month holds, for the dot under its name. */
  countFor: (year: number, month1: number) => number
  onPick: (next: { year: number; month1: number }) => void
  className?: string
}) {
  return (
    <div role="dialog" aria-label="Jump to a month" className={className}>
      <div className="mb-2 flex items-center justify-between">
        <IconButton label="Previous year" onClick={() => onJumpYear(jumpYear - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </IconButton>
        <span className="text-body-sm font-semibold text-text tabular-nums">{jumpYear}</span>
        <IconButton label="Next year" onClick={() => onJumpYear(jumpYear + 1)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
      <div className="grid grid-cols-4 gap-1 @md:grid-cols-6">
        {SHORT_MONTH_LABELS.map((name, i) => {
          const m1 = i + 1
          const isShown = jumpYear === shownYear && m1 === shownMonth1
          const count = countFor(jumpYear, m1)
          return (
            <button
              key={name}
              type="button"
              onClick={() => onPick({ year: jumpYear, month1: m1 })}
              aria-current={isShown ? 'date' : undefined}
              aria-label={`${monthLabel(jumpYear, m1)}${count ? `, ${count} on the calendar` : ''}`}
              className={cn(
                'tap-target flex flex-col items-center gap-0.5 rounded-control px-2 py-1.5 text-body-sm font-medium transition-colors',
                isShown ? 'bg-primary text-on-primary' : 'text-text hover:bg-surface-elevated',
              )}
            >
              {name}
              <span className={cn('h-1 w-1 rounded-pill', count ? (isShown ? 'bg-on-primary' : 'bg-primary') : 'bg-transparent')} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Count items per month from anything carrying a `dayKey`, keyed 'YYYY-MM'. Shared so the grid's
 *  jump and the console header's jump mark the same months. */
export function countByMonthKey(items: readonly { dayKey: string }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = item.dayKey.slice(0, 7)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

/** Read a `countByMonthKey` map the way `MonthJumpPanel` asks for it. */
export function monthCount(map: ReadonlyMap<string, number>, year: number, month1: number): number {
  return map.get(monthKey(year, month1)) ?? 0
}
