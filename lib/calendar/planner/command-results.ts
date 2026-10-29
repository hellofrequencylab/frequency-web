import { stageLabel } from './board'
import { dayLabel } from './days'
import { KINDS } from './kinds'
import { SUITE_VIEWS, SUITE_VIEW_LABEL, type SuiteView } from './suite-model'
import type { PlannerItem, PlannerKind, PlannerPlan } from './types'

// THE COMMAND BAR'S ANSWER LIST (README 4). What a person typed becomes, in this order: a row that
// adds what they described, the views that match, Today, then Plans and dates whose title holds the
// words. At most nine rows. Pure: the bar draws these and runs the one that is highlighted.

/** The key that opens each view, as the bar and the keyboard help print it. */
export const VIEW_KEY: Record<SuiteView, string> = {
  day: 'D',
  week: 'W',
  month: 'M',
  agenda: 'A',
  list: 'I',
  board: 'B',
  timeline: 'L',
}

export type CommandRow =
  | { id: string; type: 'create'; label: string; meta: string; dot: string }
  | { id: string; type: 'view'; view: SuiteView; label: string; meta: string }
  | { id: string; type: 'today'; label: string; meta: string }
  | { id: string; type: 'plan'; ref: string; label: string; meta: string }
  | { id: string; type: 'item'; ref: string; day: string; label: string; meta: string }

const MAX_ROWS = 9

/** The kind a described command makes, as the dot colour on its row. */
const CREATE_DOT: Record<'pencil' | 'private' | 'unavailable' | 'todo', PlannerKind> = {
  pencil: 'pencil',
  private: 'private',
  unavailable: 'unavailable',
  todo: 'todo',
}

export function commandRows(opts: {
  query: string
  /** The create row, when the words parse into something to add. */
  create: { kind: keyof typeof CREATE_DOT; label: string; meta: string } | null
  /** The views that draw today. */
  views: readonly SuiteView[]
  plans: readonly Pick<PlannerPlan, 'id' | 'title' | 'stage'>[]
  items: readonly Pick<PlannerItem, 'id' | 'title' | 'kind' | 'date'>[]
}): CommandRow[] {
  const q = opts.query.trim().toLowerCase()
  const rows: CommandRow[] = []
  if (q.length > 2 && opts.create) {
    rows.push({ id: 'create', type: 'create', label: opts.create.label, meta: opts.create.meta, dot: KINDS[CREATE_DOT[opts.create.kind]].dot })
  }
  for (const view of SUITE_VIEWS) {
    if (!opts.views.includes(view)) continue
    const label = SUITE_VIEW_LABEL[view].toLowerCase()
    if (!q || label.startsWith(q) || `go ${label}`.includes(q)) {
      rows.push({ id: `view:${view}`, type: 'view', view, label: `Open ${SUITE_VIEW_LABEL[view]} view`, meta: `Press ${VIEW_KEY[view]}` })
    }
  }
  if (!q || 'today'.startsWith(q)) rows.push({ id: 'today', type: 'today', label: 'Jump to today', meta: 'Press T' })
  if (q) {
    for (const p of opts.plans.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 3)) {
      rows.push({ id: `plan:${p.id}`, type: 'plan', ref: p.id, label: p.title, meta: `Plan · ${stageLabel(p.stage)}` })
    }
    for (const i of opts.items.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 4)) {
      rows.push({ id: `item:${i.id}`, type: 'item', ref: i.id, day: i.date, label: i.title, meta: `${KINDS[i.kind].word} · ${dayLabel(i.date)}` })
    }
  }
  return rows.slice(0, MAX_ROWS)
}
