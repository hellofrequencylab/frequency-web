'use client'

import { SegmentedControl } from '@/components/ui/segmented-control'
import { CALENDAR_SURFACE_DEFS, CALENDAR_SURFACES, type CalendarSurface } from '@/lib/calendar/admin-views'

// HOW THE CALENDAR IS BEING LOOKED AT (ADR-1389, ADR-1464, ADR-1467; one control since LIVE-490).
// The kit's segmented box (HYG-105). Buttons, not Links: the switch changes the grid in place.
//
// The public Calendar tab is the one place this is drawn (SCAN-1344). It is the member's control:
// `surfaces` narrows the box to the ways of looking a visitor actually has (MEMBER_SURFACES in
// lib/calendar/member-calendar.ts, Grid and List). The team's other ways of looking (Week, Agenda,
// Plans) live on the team calendar, in components/calendar-suite.
export function CalendarModeToggle({
  surface,
  onSelect,
  surfaces = CALENDAR_SURFACES,
}: {
  surface: CalendarSurface | null
  onSelect: (surface: CalendarSurface) => void
  /** Which surfaces this audience may pick from. */
  surfaces?: readonly CalendarSurface[]
}) {
  const segments = CALENDAR_SURFACE_DEFS.filter((o) => surfaces.includes(o.surface)).map((o) => ({
    value: o.surface,
    label: o.label,
  }))
  return (
    <SegmentedControl
      label="How to see the calendar"
      value={surface ?? ''}
      onChange={(next) => onSelect(next as CalendarSurface)}
      segments={segments}
    />
  )
}
