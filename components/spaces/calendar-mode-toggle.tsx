'use client'

import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  CALENDAR_ADMIN_VIEW_DEFS,
  type CalendarAdminView,
} from '@/lib/calendar/admin-views'

// ADMIN CALENDAR VIEWS (ADR-1389, ADR-1464, ADR-1467). The kit's segmented box (HYG-105).
// Buttons, not Links: the parent shell slides views without a page load.
// `?view=` stays in the URL via history.replaceState so a share still works.
// Guest is a separate audience preview beside this box, so in Guest no segment is selected.

const SEGMENTS = CALENDAR_ADMIN_VIEW_DEFS.filter((o) => o.view !== 'guest').map((o) => ({
  value: o.view,
  label: o.label,
}))

export function CalendarModeToggle({
  mode,
  onSelect,
}: {
  mode: CalendarAdminView
  onSelect: (view: CalendarAdminView) => void
}) {
  return <SegmentedControl label="Calendar views" value={mode} onChange={onSelect} segments={SEGMENTS} />
}
