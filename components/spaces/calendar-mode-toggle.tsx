'use client'

import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import {
  CALENDAR_SURFACE_DEFS,
  type CalendarSurface,
  type CalendarListScope,
} from '@/lib/calendar/admin-views'

// HOW THE CALENDAR IS BEING LOOKED AT (ADR-1389, ADR-1464, ADR-1467; folded into one control by
// LIVE-490). The kit's segmented box (HYG-105). Buttons, not Links: the parent shell slides panels
// without a page load, and `?view=` stays in the URL via history.replaceState so a share still works.
//
// ONE CONTROL. This used to be the Calendar / List / Workflow panel toggle, drawn in the header's
// ACTIONS group, while a SECOND control -- the grid / list switcher -- sat in HOW and also said
// "List", meaning this month instead of everything. Two controls, one word, different sets. They are
// one control now: Grid, List, Workflow, with the List surface carrying its own scope.
//
// Guest is NOT a segment. It is an audience preview, not a way of looking, so it stays the separate
// button beside this box and no segment is selected while it is showing.

const SEGMENTS = CALENDAR_SURFACE_DEFS.map((o) => ({ value: o.surface, label: o.label }))

export function CalendarModeToggle({
  surface,
  onSelect,
  scope,
  onScope,
}: {
  surface: CalendarSurface | null
  onSelect: (surface: CalendarSurface) => void
  /** Only rendered on the List surface, and only for the team: Guest has no all-time index. */
  scope?: CalendarListScope
  onScope?: (next: CalendarListScope) => void
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <SegmentedControl
        label="How to see the calendar"
        value={surface ?? ''}
        onChange={(next) => onSelect(next as CalendarSurface)}
        segments={SEGMENTS}
      />
      {/* THE SCOPE RIDES THE SURFACE IT BELONGS TO, and appears nowhere else. This is the one thing
          that used to force a reader to know that two different controls both said "List": the
          all-time index was a PANEL and the month agenda was a SWITCH. Here it is one surface, and
          how much of it you are reading is a choice inside that surface. */}
      {surface === 'list' && scope && onScope ? (
        <span className="inline-flex items-center rounded-control border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={scope === 'month' ? 'primary' : 'ghost'}
            aria-pressed={scope === 'month'}
            title="List only the month the calendar is showing"
            onClick={() => onScope('month')}
          >
            This month
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === 'all' ? 'primary' : 'ghost'}
            aria-pressed={scope === 'all'}
            title="List every gathering, past and ahead"
            onClick={() => onScope('all')}
          >
            All
          </Button>
        </span>
      ) : null}
    </span>
  )
}
