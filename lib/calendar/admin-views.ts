import { monthKey, safeMonth } from './month-window'

// ADMIN CALENDAR VIEWS (ADR-1464). Daniel's five views on one Space Calendar tab.
// Guest and Admin stay the two existing grids. List, Timeline, and Projects are
// additional operator views. The URL keeps `?view=guest` (ADR-1389) and adds
// list / timeline / projects. Default (no view) is Admin for a manager.

export const CALENDAR_ADMIN_VIEWS = ['admin', 'guest', 'list', 'timeline', 'projects'] as const
export type CalendarAdminView = (typeof CALENDAR_ADMIN_VIEWS)[number]

export const CALENDAR_ADMIN_VIEW_DEFS: readonly {
  view: CalendarAdminView
  label: string
  /** One line under the Calendar heading. Guest interpolates the Space name. */
  blurb: string
}[] = [
  {
    view: 'admin',
    label: 'Admin',
    blurb: 'What is penciled, in planning, in production, and cancelled. The month is the date map.',
  },
  {
    view: 'guest',
    label: 'Guest',
    blurb: 'Upcoming events from {brand}. Subscribe to add them to your own calendar.',
  },
  {
    view: 'list',
    label: 'List',
    blurb: 'Pick a gathering on the left. Stats and management open on the right.',
  },
  {
    view: 'timeline',
    label: 'Timeline',
    blurb: 'The month as a time scale, one row per gathering.',
  },
  {
    view: 'projects',
    label: 'Projects',
    blurb: 'Move an event on its way through Pencil, Planning, Production, and Cancelled.',
  },
] as const

export function isCalendarAdminView(value: string | null | undefined): value is CalendarAdminView {
  return CALENDAR_ADMIN_VIEWS.includes(value as CalendarAdminView)
}

/** Unknown or missing `view` is Admin. `guest` stays the ADR-1389 visitor URL. */
export function parseAdminCalendarView(raw: string | string[] | null | undefined): CalendarAdminView {
  const value = Array.isArray(raw) ? raw[0] : raw
  return isCalendarAdminView(value) ? value : 'admin'
}

export function firstSearchParam(raw: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0]
  return raw ?? undefined
}

export function adminViewHref(
  slug: string,
  view: CalendarAdminView,
  extras: { item?: string | null; year?: number; month1?: number } = {},
): string {
  const base = `/spaces/${slug}/calendar`
  if (view === 'admin') return base
  const params = new URLSearchParams()
  params.set('view', view)
  if (view === 'list' && extras.item) params.set('item', extras.item)
  if (view === 'timeline' && extras.year && extras.month1) {
    params.set('y', String(extras.year))
    params.set('m', String(extras.month1))
  }
  return `${base}?${params.toString()}`
}

export function calendarViewBlurb(view: CalendarAdminView, brandName: string): string {
  const def = CALENDAR_ADMIN_VIEW_DEFS.find((d) => d.view === view)
  return (def?.blurb ?? '').replace('{brand}', brandName)
}

export function parseTimelineMonth(
  yearRaw: string | string[] | null | undefined,
  monthRaw: string | string[] | null | undefined,
  fallback: { year: number; month1: number },
): { year: number; month1: number } {
  return safeMonth(firstSearchParam(yearRaw), firstSearchParam(monthRaw)) ?? fallback
}

export function timelineMonthLabel(year: number, month1: number): string {
  const key = monthKey(year, month1)
  const [y, m] = key.split('-')
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
