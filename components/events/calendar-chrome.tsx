'use client'

import type { Ref } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'
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

/**
 * What shows on the calendar: Events, In the works, Private, Unavailable, To-dos. A pressed chip
 * is showing; pressing it again hides that layer. Shown where two or more layers are offered.
 *
 * TWO DENSITIES, THE SAME FIVE WORDS (owner ruling 2026-09-24). This is the widest group in either
 * header, and the console has to fit ONE row, so `micro` takes the padding and the type down.
 * What it deliberately does NOT do is drop the labels for dots or fold the five into a "showing
 * 3 of 5" menu: the visible word IS each chip's accessible name (WCAG 2.5.3), and a colour with a
 * tooltip has no visible label to match. `text-2xs` is the repo's sub-xs CHROME floor and is
 * unscaled by the type preset on purpose (app/globals.css) -- a toggle is chrome, not content.
 *
 * 🔴 `tap-target` STAYS ON BOTH. It is a min-size, not a padding, and it grows to `--tap-min` on a
 * coarse pointer. "Micro" is the type and the box, never the thing a thumb has to hit.
 */
export function CalendarLayerChips({
  layers,
  hidden,
  onToggle,
  density = 'comfortable',
  className,
}: {
  layers: readonly CalendarLayerKey[]
  hidden: ReadonlySet<CalendarLayerKey>
  onToggle: (key: CalendarLayerKey) => void
  /** `micro` in a header that must hold one row; `comfortable` where there is room. */
  density?: 'comfortable' | 'micro'
  className?: string
}) {
  const micro = density === 'micro'
  return (
    <div
      className={cn('flex items-center', micro ? 'gap-1' : 'flex-wrap gap-1.5', className)}
      role="group"
      aria-label="Show on the calendar"
    >
      {CALENDAR_LAYERS.filter((l) => layers.includes(l.key)).map((l) => {
        const on = !hidden.has(l.key)
        return (
          <button
            key={l.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(l.key)}
            className={cn(
              'tap-target shrink-0 whitespace-nowrap rounded-pill border font-medium transition-colors',
              micro ? 'px-2 py-0.5 text-2xs' : 'px-3 py-1 text-meta',
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

/**
 * THE MONTH, AND THE BUTTON THAT JUMPS TO ANOTHER ONE — one definition (LIVE-494).
 *
 * This existed TWICE and had already drifted apart, which is the exact failure the note at the top
 * of this file warns about. The grid drew `text-body-lg font-semibold` in a plain button; the
 * console drew `text-lead font-bold` inside an `<h2>`. Same control, two sizes, two elements.
 *
 * 🔴 THE HEADING ELEMENT IS LOAD-BEARING IN THE CONSOLE. `calendar-console.tsx` points the dialog's
 * `aria-labelledby` at this heading's id, so it must render even on a surface with no month -- an
 * all-time List or the Workflow board -- where it names what is being read instead. That is why
 * `hasMonth` swaps the CONTENT and never the heading itself.
 *
 * ONE LIVE REGION. The month label carries `aria-live="polite"` wherever it is drawn, and exactly
 * one copy may be mounted: `calendarChrome()` takes this off the grid whenever a host draws it, so
 * the page and the console never speak the month at the same time.
 */
export function CalendarMonthTitle({
  headingId,
  label,
  hasMonth = true,
  fallbackTitle,
  jumpOpen,
  onToggleJump,
  buttonRef,
  jumpMark,
  density = 'comfortable',
  className,
}: {
  /** Set where something points `aria-labelledby` at this heading (the console dialog does). */
  headingId?: string
  /** "October 2026". */
  label: string
  /** False on a surface with no month; the heading then names the surface. */
  hasMonth?: boolean
  /** What the heading says when there is no month. */
  fallbackTitle?: string
  jumpOpen: boolean
  onToggleJump: () => void
  buttonRef?: Ref<HTMLButtonElement>
  /** A `data-` attribute the host stamps on the TRIGGER, so `HOST_DRAWN_CONTROL_MARKS` marks the
   *  control itself rather than the box around it. The console passes its marker here; a site that
   *  takes no chrome off the grid passes nothing. */
  jumpMark?: string
  density?: 'comfortable' | 'micro'
  className?: string
}) {
  const micro = density === 'micro'
  return (
    <h2
      id={headingId}
      className={cn('min-w-0 truncate text-text', micro ? 'text-body font-semibold' : 'text-body-lg font-semibold', className)}
    >
      {hasMonth ? (
        <button
          ref={buttonRef}
          {...(jumpMark ? { [jumpMark]: true } : {})}
          type="button"
          onClick={onToggleJump}
          aria-expanded={jumpOpen}
          aria-haspopup="dialog"
          title="Jump to a month"
          className={cn(
            'tap-target inline-flex items-center gap-1 rounded-control transition-colors hover:bg-surface-elevated',
            micro ? 'px-1 py-0.5' : 'px-1.5 py-1',
          )}
        >
          <span aria-live="polite">{label}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', jumpOpen && 'rotate-180')} aria-hidden />
        </button>
      ) : (
        <span>{fallbackTitle}</span>
      )}
    </h2>
  )
}

/**
 * PREVIOUS / TODAY / NEXT — one definition (LIVE-494), and it settles a real drift.
 *
 * The grid disabled Today on the month already showing; the console never did. The grid's is the
 * one that survives, and its own comment says why: a control that VANISHES from under the focus
 * that just pressed it is a focus bug, so it stays mounted and goes `disabled` instead, and focus
 * moves to the month title, which reads the month it landed on.
 *
 * ‹ and › are `IconButton`, which is a 32px `tap-target` that GROWS on a coarse pointer. The micro
 * density takes the box and the type down around them and never the hit area.
 */
export function CalendarPaging({
  onStep,
  onToday,
  onCurrentMonth,
  density = 'comfortable',
  className,
}: {
  onStep: (delta: -1 | 1) => void
  onToday: () => void
  /** The month showing IS this month, so Today would do nothing. */
  onCurrentMonth: boolean
  density?: 'comfortable' | 'micro'
  className?: string
}) {
  const micro = density === 'micro'
  return (
    <div className={cn('flex shrink-0 items-center', micro ? 'gap-0' : 'gap-1', className)}>
      <IconButton label="Previous month" onClick={() => onStep(-1)}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </IconButton>
      <button
        type="button"
        disabled={onCurrentMonth}
        onClick={onToday}
        className={cn(
          'tap-target rounded-control font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted',
          micro ? 'px-1.5 py-0.5 text-2xs' : 'px-2.5 py-1 text-body-sm',
        )}
      >
        Today
      </button>
      <IconButton label="Next month" onClick={() => onStep(1)}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </IconButton>
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
