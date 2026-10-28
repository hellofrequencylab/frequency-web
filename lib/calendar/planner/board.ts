import { KINDS, HEALTH_TONES } from './kinds'
import { dayLabel } from './days'
import { holdLine, isHoldLapsed } from './hold'
import { isInvitePending, isShared } from './day-items'
import type { PlanStage, PlannerData, PlannerItem, PlannerPlan, PlannerTask } from './types'

// THE BOARD (Kanban) AND THE LIST. Both group Plans by stage in the same order, so one function
// feeds both: Kanban draws every column, List draws the ones that hold a Plan.

interface StageDef {
  key: PlanStage
  /** The word a person reads. The `event` stage is called Published. */
  label: string
  hint: string
}

/** The five stages, in column order. */
export const STAGES: readonly StageDef[] = [
  { key: 'pencil', label: 'Pencil', hint: 'A date being held. Nothing decided yet.' },
  { key: 'planning', label: 'Planning', hint: 'It is happening. The team is putting it together.' },
  { key: 'production', label: 'Production', hint: 'Ready to run. Publish when you want people to see it.' },
  { key: 'event', label: 'Published', hint: 'On your public calendar. People can RSVP.' },
  { key: 'cancelled', label: 'Cancelled', hint: 'Drop a Plan here to call it off. Its dates stay on the team calendar, struck through.' },
]

/** The stage's label, or the raw key for an unknown one. */
export function stageLabel(stage: string): string {
  return STAGES.find((s) => s.key === stage)?.label ?? stage
}

type HealthKey = 'on-track' | 'overdue' | 'holding' | 'hold-lapsed' | 'needs-date' | 'cancelled'

export interface Health {
  key: HealthKey
  /** "On track", "2 overdue", "Holding", "Hold lapsed", "Needs a date" or "Cancelled". */
  label: string
  fg: string
  bg: string
}

interface PlanStats {
  /** The Plan's dates, earliest first. */
  items: PlannerItem[]
  /** The next date from today on, else the last one, else null. */
  next: PlannerItem | null
  todos: PlannerTask[]
  done: number
  late: number
  /** Percent of to-dos done, 0 when there are none. */
  pct: number
  health: Health
  /** "Holding until Oct 27 · 6 days left", or empty. */
  hold: string
}

/** Progress, next date, health and hold line for one Plan. Health, first match wins: no dates, then
 *  cancelled, then overdue to-dos, then a lapsed or live hold, then on track. */
export function planStats(
  plan: PlannerPlan,
  data: Pick<PlannerData, 'items' | 'tasks'>,
  today: string,
): PlanStats {
  const items = data.items.filter((i) => i.plan === plan.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const next = items.find((i) => i.date >= today) ?? items[items.length - 1] ?? null
  const todos = data.tasks.filter((t) => t.plan === plan.id)
  const done = todos.filter((t) => t.done).length
  const late = todos.filter((t) => !t.done && t.due && t.due < today).length
  let health: Health
  if (!items.length) health = { key: 'needs-date', label: 'Needs a date', ...HEALTH_TONES.needsDate }
  else if (plan.stage === 'cancelled') health = { key: 'cancelled', label: 'Cancelled', ...HEALTH_TONES.holding }
  else if (late) health = { key: 'overdue', label: `${late} overdue`, ...HEALTH_TONES.overdue }
  else if (plan.stage === 'pencil') {
    health = isHoldLapsed(plan.hold, today)
      ? { key: 'hold-lapsed', label: 'Hold lapsed', ...HEALTH_TONES.overdue }
      : { key: 'holding', label: 'Holding', ...HEALTH_TONES.holding }
  } else health = { key: 'on-track', label: 'On track', ...HEALTH_TONES.onTrack }
  return {
    items,
    next,
    todos,
    done,
    late,
    pct: todos.length ? Math.round((done * 100) / todos.length) : 0,
    health,
    hold: plan.stage === 'pencil' ? holdLine(plan.hold, today) : '',
  }
}

interface BoardCard {
  id: string
  title: string
  target: string
  stage: PlanStage
  /** The next date's day key, or null. */
  nextDate: string | null
  /** "Wed, Oct 21 · 3 dates", or "No date yet". */
  when: string
  dateCount: number
  /** "3 of 5 to-dos", or "No to-dos yet". */
  tasks: string
  pct: number
  health: Health
  hold: string
  team: string[]
  /** Other Spaces on the Plan, for the partner tags. */
  partnerSpaceIds: string[]
  shared: boolean
  invitePending: boolean
}

interface BoardColumn extends StageDef {
  dot: string
  cards: BoardCard[]
}

/** The Plans grouped into the five stage columns, each card carrying its health and hold line. */
export function buildBoard(data: PlannerData, today: string, ownSpaceId: string): BoardColumn[] {
  return STAGES.map((stage) => ({
    ...stage,
    dot: KINDS[stage.key].dot,
    cards: data.plans
      .filter((p) => p.stage === stage.key)
      .map((plan) => {
        const s = planStats(plan, data, today)
        return {
          id: plan.id,
          title: plan.title,
          target: plan.target,
          stage: plan.stage,
          nextDate: s.next?.date ?? null,
          when: s.next ? dayLabel(s.next.date) + (s.items.length > 1 ? ` · ${s.items.length} dates` : '') : 'No date yet',
          dateCount: s.items.length,
          tasks: s.todos.length ? `${s.done} of ${s.todos.length} to-dos` : 'No to-dos yet',
          pct: s.pct,
          health: s.health,
          hold: s.hold,
          team: plan.team,
          partnerSpaceIds: plan.spaces.filter((x) => x.id !== ownSpaceId).map((x) => x.id),
          shared: isShared(plan, ownSpaceId),
          invitePending: isInvitePending(plan, ownSpaceId),
        }
      }),
  }))
}

/** The List view: the board's columns that hold at least one Plan. */
export function listGroups(columns: readonly BoardColumn[]): BoardColumn[] {
  return columns.filter((c) => c.cards.length > 0)
}
