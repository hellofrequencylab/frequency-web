'use client'

import { cn } from '@/lib/utils'
import {
  CALENDAR_ADMIN_VIEW_DEFS,
  type CalendarAdminView,
} from '@/lib/calendar/admin-views'

// ADMIN CALENDAR VIEWS (ADR-1389, ADR-1464, ADR-1467). Segmented control.
// Buttons, not Links: the parent shell slides views without a page load.
// `?view=` stays in the URL via history.replaceState so a share still works.

export type CalendarMode = CalendarAdminView

export function CalendarModeToggle({
  mode,
  onSelect,
}: {
  mode: CalendarAdminView
  onSelect: (view: CalendarAdminView) => void
}) {
  return (
    <nav
      aria-label="Calendar views"
      className="inline-flex max-w-full flex-wrap items-center rounded-control border border-border p-0.5"
    >
      {CALENDAR_ADMIN_VIEW_DEFS.map((o) => (
        <button
          key={o.view}
          type="button"
          onClick={() => onSelect(o.view)}
          aria-pressed={mode === o.view}
          className={cn(
            'rounded-control px-3 py-1 text-body-sm font-semibold transition-colors',
            mode === o.view ? 'bg-primary text-on-primary' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </nav>
  )
}
