'use client'

import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import {
  CALENDAR_SURFACE_DEFS,
  CALENDAR_SURFACES,
  type CalendarSurface,
  type CalendarListScope,
} from '@/lib/calendar/admin-views'
import { CALENDAR_TIME_VIEW_DEFS, type CalendarTimeView } from '@/lib/calendar/time-views'

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

// A MEMBER GETS THIS CONTROL TOO (LIVE-520), over the surfaces a member actually has. `surfaces`
// narrows the box rather than a second component drawing two of the same three segments: a visitor
// is offered Grid and List and no Workflow, because Workflow is a board of the team's internal
// Plans and a visitor is never handed one. Same control, same words, same order — one fewer
// segment. See MEMBER_SURFACES in lib/calendar/member-calendar.ts for the full reasoning.
export function CalendarModeToggle({
  surface,
  onSelect,
  scope,
  onScope,
  surfaces = CALENDAR_SURFACES,
  timeView = null,
  onTimeView,
}: {
  surface: CalendarSurface | null
  onSelect: (surface: CalendarSurface) => void
  /** Only rendered on the List surface, and only for the team: Guest has no all-time index. */
  scope?: CalendarListScope
  onScope?: (next: CalendarListScope) => void
  /** Which surfaces this audience may pick from. Defaults to all three (the operator's box). */
  surfaces?: readonly CalendarSurface[]
  /** The Day, Week or Timeline view showing, or null when a surface is (LIVE-1178). */
  timeView?: CalendarTimeView | null
  /** Offered to the team only. Without it the box is the three surfaces, as a member sees it. */
  onTimeView?: (next: CalendarTimeView) => void
}) {
  const segments = CALENDAR_SURFACE_DEFS.filter((o) => surfaces.includes(o.surface)).map((o) => ({
    value: o.surface,
    label: o.label,
  }))
  return (
    <span className="inline-flex items-center gap-2">
      <SegmentedControl
        label="How to see the calendar"
        value={timeView ? '' : (surface ?? '')}
        onChange={(next) => onSelect(next as CalendarSurface)}
        segments={segments}
      />
      {/* DAY, WEEK, TIMELINE (LIVE-1178): the team's other three ways of looking, in a box of their
          own beside the three surfaces. They are not surfaces (CALENDAR_SURFACES stays three, and
          its pinned order with it), so the two boxes never share a selection: choosing one clears
          the other. A member is never handed this box. */}
      {onTimeView ? (
        <SegmentedControl
          label="Day, week or timeline"
          value={timeView ?? ''}
          onChange={(next) => onTimeView(next as CalendarTimeView)}
          segments={CALENDAR_TIME_VIEW_DEFS.map((d) => ({ value: d.view, label: d.label }))}
        />
      ) : null}
      {/* THE SCOPE RIDES THE SURFACE IT BELONGS TO, and appears nowhere else. This is the one thing
          that used to force a reader to know that two different controls both said "List": the
          all-time index was a PANEL and the month agenda was a SWITCH. Here it is one surface, and
          how much of it you are reading is a choice inside that surface. */}
      {surface === 'list' && !timeView && scope && onScope ? (
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
