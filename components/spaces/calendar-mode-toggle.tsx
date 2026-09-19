import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  adminViewHref,
  CALENDAR_ADMIN_VIEW_DEFS,
  type CalendarAdminView,
} from '@/lib/calendar/admin-views'

// ADMIN CALENDAR VIEWS (ADR-1389, ADR-1464). Segmented control in Admin Calendar chrome.
// Guest and Admin stay the two grids. List, Timeline, and Projects are additional views.
// Links, not client state: `?view=guest` stays the visitor URL; the server only loads the
// private layer for operator views.

export type CalendarMode = CalendarAdminView

export function CalendarModeToggle({ slug, mode }: { slug: string; mode: CalendarAdminView }) {
  return (
    <nav
      aria-label="Calendar views"
      className="inline-flex max-w-full flex-wrap items-center rounded-control border border-border p-0.5"
    >
      {CALENDAR_ADMIN_VIEW_DEFS.map((o) => (
        <Link
          key={o.view}
          href={adminViewHref(slug, o.view)}
          scroll={false}
          replace
          aria-current={mode === o.view ? 'page' : undefined}
          className={cn(
            'rounded-control px-3 py-1 text-body-sm font-semibold transition-colors',
            mode === o.view ? 'bg-primary text-on-primary' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  )
}
