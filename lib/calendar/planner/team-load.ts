import type { PlannerItem, PlannerTask } from './types'
import { addDays } from './days'

// TEAM LOAD AND PACE. Hours booked in the next seven days, per person, against a 20 hour week that
// reads as full. The pace word and its thresholds are the prototype's exactly.

/** Hours a person can book in a week before the bar reads as full. */
const FULL_WEEK_HOURS = 20
/** Hours at which a person's row reads as hot (shown as a flag). */
const HOT_HOURS = 16
/** A to-do with no estimate counts as half an hour. */
const DEFAULT_TODO_HOURS = 0.5
/** Team fill above this reads as a charged week. */
const CHARGE_ABOVE = 0.75
/** Team fill above this reads as a flowing week. */
const FLOW_ABOVE = 0.35

export type Pace = 'still' | 'flow' | 'charge'

export interface TeamMember {
  id: string
  name: string
}

interface MemberLoad {
  id: string
  name: string
  /** Open to-dos due by the end of the week, overdue ones included. Undated ones are not counted. */
  openTodos: number
  /** Hours: estimates of those to-dos plus timed items this week. */
  hours: number
  /** "6 h". */
  hoursLabel: string
  /** Bar width, 0 to 100, capped. */
  pct: number
  /** True at or past a full week. */
  full: boolean
  hot: boolean
}

interface TeamLoad {
  members: MemberLoad[]
  pace: Pace
  paceLabel: string
  /** Booked hours over capacity, uncapped (1.2 = 120%). */
  fill: number
  /** "42% of team hours booked". */
  note: string
}

/** Pace word for a team fill: still up to 35%, flow up to 75%, charge above. */
export function paceOf(fill: number): Pace {
  return fill > CHARGE_ABOVE ? 'charge' : fill > FLOW_ABOVE ? 'flow' : 'still'
}

const PACE_LABEL: Record<Pace, string> = { still: 'Still week', flow: 'Flowing week', charge: 'Charged week' }

/** Hours, minutes of timed items and to-do estimates, per team member for the seven days from today.
 *  Cancelled items and multi-day runs take no booked time. */
export function teamLoad(
  members: readonly TeamMember[],
  tasks: readonly PlannerTask[],
  items: readonly PlannerItem[],
  today: string,
): TeamLoad {
  const weekEnd = addDays(today, 7)
  const rows: MemberLoad[] = members.map((m) => {
    const open = tasks.filter((t) => t.owner === m.id && !t.done && t.due && t.due <= weekEnd)
    const todoHours = open.reduce((sum, t) => sum + (t.estHours || DEFAULT_TODO_HOURS), 0)
    const itemHours = items
      .filter(
        (i) =>
          i.owner === m.id &&
          i.kind !== 'cancelled' &&
          !i.end &&
          i.startMin != null &&
          i.date >= today &&
          i.date <= weekEnd,
      )
      .reduce((sum, i) => sum + i.durMin / 60, 0)
    const hours = todoHours + itemHours
    return {
      id: m.id,
      name: m.name,
      openTodos: open.length,
      hours,
      hoursLabel: `${Math.round(hours)} h`,
      pct: Math.min(100, Math.round((hours * 100) / FULL_WEEK_HOURS)),
      full: hours >= FULL_WEEK_HOURS,
      hot: hours > HOT_HOURS,
    }
  })
  const capacity = rows.length * FULL_WEEK_HOURS
  const fill = capacity ? rows.reduce((s, r) => s + r.hours, 0) / capacity : 0
  const pace = paceOf(fill)
  return { members: rows, pace, paceLabel: PACE_LABEL[pace], fill, note: `${Math.round(fill * 100)}% of team hours booked` }
}
