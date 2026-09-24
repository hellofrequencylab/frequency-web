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
    blurb: 'The month as your team sees it: every draft, Pencil, Private entry, Unavailable time and unpublished gathering.',
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

/** What travels in the operator calendar URL beside `view`: the List selection, the open Plan, and
 *  whether the Calendar console is up (PROG-CAL12). The console is a flag, not a view: it wraps
 *  whichever view is showing, so `?console=1` sits beside `view`, `item` and `plan` rather than
 *  replacing any of them, and a pasted link reopens the console on the same view and drawer.
 *
 *  🔴 THE MONTH IS NOT IN HERE (LIVE-475). It used to declare `year` and `month1`, `syncUrl`
 *  forwarded them, `adminViewHref` never read them and no caller ever passed them: three layers of
 *  a parameter that looked wired and was not, and the gap behind a docs line claiming a pasted link
 *  restored the month. A link lands on the month the page derives. Putting the month back means
 *  deciding what a Back press after six month steps does, which is a ruling, not a field. */
export type AdminViewExtras = {
  item?: string | null
  plan?: string | null
  console?: boolean
}

export function adminViewHref(slug: string, view: CalendarAdminView, extras: AdminViewExtras = {}): string {
  const base = `/spaces/${slug}/calendar`
  const params = new URLSearchParams()
  if (view !== 'admin') params.set('view', view)
  if (view === 'list' && extras.item) params.set('item', extras.item)
  if (extras.plan) params.set('plan', extras.plan)
  if (extras.console) params.set('console', '1')
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

/** `?console=1` (or `true`) opens the Calendar console on load. Anything else, or nothing, is the page. */
export function parseConsoleFlag(raw: string | string[] | null | undefined): boolean {
  const value = firstSearchParam(raw)
  return value === '1' || value === 'true'
}

export function calendarViewBlurb(view: CalendarAdminView, brandName: string): string {
  const def = CALENDAR_ADMIN_VIEW_DEFS.find((d) => d.view === view)
  return (def?.blurb ?? '').replace('{brand}', brandName)
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

// ─── ONE CONTROL, NOT TWO (LIVE-490, owner ask 2026-09-23: the List states "are super confused and
// need to be minimized ... into one system / controls") ──────────────────────────────────────────
//
// "List" used to name TWO controls in the same header bar, over different sets:
//   · the grid / list switcher (components/events/calendar-chrome.tsx), which showed THIS MONTH as
//     an agenda, and
//   · the Calendar / List / Workflow panel toggle, whose List is the ALL-TIME index of gatherings.
// calendar-chrome.tsx carried a comment warning they were not the same control. A comment is not a
// fix: a reader still met one word meaning two things, and the bar changed SHAPE between panels
// because the switcher was only handed to the Calendar and Guest panels.
//
// So the two collapse into ONE surface a reader picks from -- Grid, List, Workflow -- and the List
// surface carries its own scope (this month, or everything). Guest stays OUTSIDE this control: it
// is an audience preview, not a way of looking, and it has neither Workflow nor the all-time index.
//
// The panel values above are unchanged, so every existing `?view=` deep link still resolves: this
// is a projection over them, not a replacement.

/** How the calendar is being looked at. Guest is an audience, not a surface, so it is not here. */
export const CALENDAR_SURFACES = ['grid', 'list', 'workflow'] as const
export type CalendarSurface = (typeof CALENDAR_SURFACES)[number]

/** What the List surface is listing. Only ever read when the surface is `list`. */
export type CalendarListScope = 'month' | 'all'

export const CALENDAR_SURFACE_DEFS: readonly { surface: CalendarSurface; label: string }[] = [
  { surface: 'grid', label: 'Grid' },
  { surface: 'list', label: 'List' },
  { surface: 'workflow', label: 'Workflow' },
] as const

/** The surface a (panel, grid-view) pair is showing. The all-time List panel and a Calendar panel
 *  switched to its agenda are BOTH the List surface; the scope below is what separates them. */
export function surfaceOf(view: CalendarAdminView, gridView: 'grid' | 'list'): CalendarSurface {
  if (view === 'workflow') return 'workflow'
  if (view === 'list') return 'list'
  return gridView === 'list' ? 'list' : 'grid'
}

/** `all` only on the dedicated index panel; a Calendar or Guest agenda is always this month's. */
export function listScopeOf(view: CalendarAdminView): CalendarListScope {
  return view === 'list' ? 'all' : 'month'
}

/** The panel + grid-view a surface maps back onto, keeping the viewer's audience.
 *  `audience` is 'guest' only while the Guest preview is showing; Guest has no all-time index and
 *  no Workflow, so both fall back to the team's panel the way selecting them always did. */
export function viewForSurface(
  surface: CalendarSurface,
  scope: CalendarListScope,
  audience: 'guest' | 'staff',
): { view: CalendarAdminView; gridView: 'grid' | 'list' } {
  if (surface === 'workflow') return { view: 'workflow', gridView: 'grid' }
  if (surface === 'list') {
    if (scope === 'all' && audience === 'staff') return { view: 'list', gridView: 'list' }
    return { view: audience === 'guest' ? 'guest' : 'admin', gridView: 'list' }
  }
  return { view: audience === 'guest' ? 'guest' : 'admin', gridView: 'grid' }
}

/** Whether the header's WHEN group (the month, its jump, and Prev / Today / Next) steers anything.
 *  An all-time index and the Workflow board have no month, so drawing a month beside them is a
 *  control that does nothing -- which is what the owner was looking at in the List panel, where the
 *  bar still said "September 2026" over a list running into October. A control that is drawn is a
 *  control that works, so these hide rather than sit there dead. */
export function surfaceHasMonth(surface: CalendarSurface, scope: CalendarListScope): boolean {
  if (surface === 'workflow') return false
  if (surface === 'list') return scope === 'month'
  return true
}
