import { monthKey, safeMonth } from './month-window'

// Operator views are Calendar, List, and Workflow. Guest is a separate audience preview.
// Legacy timeline/projects URL values are accepted and safely mapped below.

export const CALENDAR_ADMIN_VIEWS = ['guest', 'admin', 'list', 'workflow'] as const
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
    label: 'Calendar',
    blurb: 'The same month as Guest, with every draft, pencil, private date, and unpublished gathering your team can see.',
  },
  {
    view: 'list',
    label: 'List',
    blurb: 'Pick a gathering on the left. The right pane is the control console for that event.',
  },
  { view: 'workflow', label: 'Workflow', blurb: 'Every Plan, grouped by its production stage.' },
] as const

export function isCalendarAdminView(value: string | null | undefined): value is CalendarAdminView {
  return CALENDAR_ADMIN_VIEWS.includes(value as CalendarAdminView)
}

/** Unknown or missing `view` is Admin. `guest` stays the ADR-1389 visitor URL. */
export function parseAdminCalendarView(raw: string | string[] | null | undefined): CalendarAdminView {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'projects') return 'workflow'
  if (value === 'timeline') return 'admin'
  return isCalendarAdminView(value) ? value : 'admin'
}

export function firstSearchParam(raw: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0]
  return raw ?? undefined
}

export function adminViewHref(
  slug: string,
  view: CalendarAdminView,
  extras: { item?: string | null; plan?: string | null; year?: number; month1?: number } = {},
): string {
  const base = `/spaces/${slug}/calendar`
  const params = new URLSearchParams()
  if (view !== 'admin') params.set('view', view)
  if (view === 'list' && extras.item) params.set('item', extras.item)
  if (extras.plan) params.set('plan', extras.plan)
  const query = params.toString()
  return query ? `${base}?${query}` : base
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
  if (raw === 'projects') return 'workflow'
  if (raw === 'timeline') return 'admin'
  return isCalendarAdminView(raw) ? raw : null
}

/** Query wins when it names a view. Otherwise the cookie. Otherwise Admin. */
export function resolveOperatorCalendarView(
  queryView: string | string[] | null | undefined,
  cookieView: string | null | undefined,
): CalendarAdminView {
  const query = Array.isArray(queryView) ? queryView[0] : queryView
  if (query === 'projects' || query === 'timeline' || isCalendarAdminView(query)) {
    return parseAdminCalendarView(query)
  }
  return parseRememberedCalendarView(cookieView) ?? 'admin'
}

export function rememberCalendarView(slug: string, view: CalendarAdminView): void {
  if (typeof document === 'undefined') return
  document.cookie = `${calendarViewCookieName(slug)}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`
}
