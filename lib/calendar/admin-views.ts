import { monthKey, safeMonth } from './month-window'

// ADMIN CALENDAR VIEWS (ADR-1464, ADR-1467). Daniel's five views on one Space Calendar tab.
// Order on the control: Guest, Admin, List, Timeline, Projects. Guest and Admin stay the
// two existing grids. List, Timeline, and Projects are additional operator views. The URL
// keeps `?view=guest` (ADR-1389) and adds list / timeline / projects. Default (no view, no
// cookie) is Admin for a manager. Operators switch client-side; the last view is remembered.

export const CALENDAR_ADMIN_VIEWS = ['guest', 'admin', 'list', 'timeline', 'projects'] as const
export type CalendarAdminView = (typeof CALENDAR_ADMIN_VIEWS)[number]

export const CALENDAR_ADMIN_VIEW_DEFS: readonly {
  view: CalendarAdminView
  label: string
  /** One line under the Calendar heading. Guest interpolates the Space name. */
  blurb: string
}[] = [
  {
    view: 'guest',
    label: 'Guest',
    blurb: 'Upcoming events from {brand}. Subscribe to add them to your own calendar.',
  },
  {
    view: 'admin',
    label: 'Admin',
    blurb: 'What is penciled, in planning, in production, and cancelled. The month is the date map.',
  },
  {
    view: 'list',
    label: 'List',
    blurb: 'Pick a gathering on the left. A truncated card with its stats opens on the right.',
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

/** Per-Space cookie so the last operator view survives a later visit (ADR-1467). */
export function calendarViewCookieName(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 80).toLowerCase()
  return `freq-cal-view-${safe || 'space'}`
}

export function parseRememberedCalendarView(raw: string | null | undefined): CalendarAdminView | null {
  return isCalendarAdminView(raw) ? raw : null
}

/** Query wins when it names a view. Otherwise the cookie. Otherwise Admin. */
export function resolveOperatorCalendarView(
  queryView: string | string[] | null | undefined,
  cookieView: string | null | undefined,
): CalendarAdminView {
  const query = Array.isArray(queryView) ? queryView[0] : queryView
  if (isCalendarAdminView(query)) return query
  return parseRememberedCalendarView(cookieView) ?? 'admin'
}

export function rememberCalendarView(slug: string, view: CalendarAdminView): void {
  if (typeof document === 'undefined') return
  document.cookie = `${calendarViewCookieName(slug)}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`
}
