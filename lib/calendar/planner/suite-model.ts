import { isShared } from './day-items'
import { KINDS } from './kinds'
import type { PlannerData, PlannerLayer } from './types'

// THE CALENDAR SUITE'S OWN STATE VOCABULARY: the seven views and the key that opens each, the six Show
// tiles, the count each tile carries, and the remembered view. Pure. The shell reads it; nothing in
// here touches the DOM.

export const SUITE_VIEWS = ['day', 'week', 'month', 'agenda', 'list', 'board', 'timeline'] as const
export type SuiteView = (typeof SUITE_VIEWS)[number]

export const SUITE_VIEW_LABEL: Record<SuiteView, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  agenda: 'Agenda',
  list: 'List',
  board: 'Kanban',
  timeline: 'Timeline',
}

/** The views that draw today. The rest show a quiet "coming soon" until their pass lands. */
export const READY_VIEWS: readonly SuiteView[] = ['day', 'week', 'month', 'agenda']

const KEY_VIEW: Record<string, SuiteView> = {
  d: 'day',
  w: 'week',
  m: 'month',
  a: 'agenda',
  i: 'list',
  b: 'board',
  l: 'timeline',
}

/** The cookie word for a view. Kanban is the board the old Workflow tab remembered, so it keeps that
 *  word and a Space that last left Workflow open comes back on Kanban. */
export function viewCookieValue(view: SuiteView): string {
  return view === 'board' ? 'workflow' : view
}

/** A remembered view, from the cookie or the link. Reads the old tab words too (Calendar is Month,
 *  Workflow is Kanban); Guest was never an operator view, so it is nothing here. */
export function parseSuiteView(raw: string | string[] | null | undefined): SuiteView | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  if (value === 'admin') return 'month'
  if (value === 'workflow' || value === 'board') return 'board'
  return (SUITE_VIEWS as readonly string[]).includes(value) ? (value as SuiteView) : null
}

/** What opens first: the link, else the remembered view, else Month (Agenda under 720px). */
export function resolveSuiteView(
  query: string | string[] | null | undefined,
  cookie: string | null | undefined,
  narrow: boolean,
): SuiteView {
  return parseSuiteView(query) ?? parseSuiteView(cookie) ?? (narrow ? 'agenda' : 'month')
}

type SuiteKeyAction =
  | { type: 'view'; view: SuiteView }
  | { type: 'today' }
  | { type: 'page'; delta: -1 | 1 }
  | { type: 'pencil' }
  | { type: 'ask' }
  | { type: 'escape' }

/** What a keypress means to the calendar, or null to let it through. Keys with a modifier are the
 *  browser's, and a key typed into a field, or while a sheet holds focus, is the person's. */
export function suiteKeyAction(e: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  /** The focused element's tag, upper case, or null. */
  targetTag?: string | null
  targetEditable?: boolean
  /** True while a sheet or dialog is open over the calendar. */
  inSheet?: boolean
}): SuiteKeyAction | null {
  if (e.key === 'Escape') return { type: 'escape' }
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.inSheet || e.targetEditable) return null
  const tag = e.targetTag ?? ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null
  if (e.key === 'ArrowLeft') return { type: 'page', delta: -1 }
  if (e.key === 'ArrowRight') return { type: 'page', delta: 1 }
  const k = e.key.length === 1 ? e.key.toLowerCase() : ''
  if (k === 't') return { type: 'today' }
  if (k === 'p') return { type: 'pencil' }
  if (e.key === '/') return { type: 'ask' }
  return KEY_VIEW[k] ? { type: 'view', view: KEY_VIEW[k] } : null
}

interface LayerDef {
  key: PlannerLayer
  label: string
  /** Icon id in the Frequency sprite. */
  icon: 'event' | 'edit' | 'link' | 'shield' | 'door' | 'check'
}

/** The six Show tiles, in the order the rail prints them. */
export const SUITE_LAYERS: readonly LayerDef[] = [
  { key: 'events', label: 'Events', icon: 'event' },
  { key: 'works', label: 'In the works', icon: 'edit' },
  { key: 'shared', label: 'Shared with Spaces', icon: 'link' },
  { key: 'private', label: 'Private', icon: 'shield' },
  { key: 'unavailable', label: 'Unavailable', icon: 'door' },
  { key: 'todos', label: 'To-dos', icon: 'check' },
]

/** What each Show tile holds in one month ('YYYY-MM'). Hidden tiles still count, so a tile that is
 *  off says how much it is hiding. */
export function layerCounts(data: PlannerData, ym: string, ownSpaceId: string): Record<PlannerLayer, number> {
  const out: Record<PlannerLayer, number> = { events: 0, works: 0, shared: 0, private: 0, unavailable: 0, todos: 0 }
  for (const it of data.items) {
    if (it.date.slice(0, 7) !== ym) continue
    if (it.from) {
      out.shared += 1
      continue
    }
    out[KINDS[it.kind].layer] += 1
    if (it.shared || isShared(data.plans.find((p) => p.id === it.plan), ownSpaceId)) out.shared += 1
  }
  for (const t of data.tasks) if (t.due && t.due.slice(0, 7) === ym) out.todos += 1
  return out
}

/** The whole day count of every month in a year, for the jump panel: items and to-dos by 'YYYY-MM'. */
export function countByMonth(data: PlannerData): Map<string, number> {
  const out = new Map<string, number>()
  for (const it of data.items) {
    if (it.kind === 'cancelled') continue
    const ym = it.date.slice(0, 7)
    out.set(ym, (out.get(ym) ?? 0) + 1)
  }
  for (const t of data.tasks) {
    if (!t.due) continue
    const ym = t.due.slice(0, 7)
    out.set(ym, (out.get(ym) ?? 0) + 1)
  }
  return out
}
