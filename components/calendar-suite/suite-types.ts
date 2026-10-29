import type { SuiteItem, SuitePlan, SuiteTask } from '@/lib/calendar/planner/adapters'

// What the calendar suite's parts share: a person on the team, the one thing selected in Details, and
// the context every part reads (today, this Space, the lookups). Types only, so a Server Component can
// import it and it adds nothing to a bundle.

export interface SuiteTeamMember {
  id: string
  name: string
  avatarUrl: string | null
}

/** The one record Details shows. */
export type SuiteSelection =
  | { kind: 'item'; id: string }
  | { kind: 'todo'; id: string }
  | { kind: 'plan'; id: string }
  | null

export interface SuiteContext {
  ownSpaceId: string
  ownName: string
  today: string
  /** False for someone who can read the calendar but not change it: Details shows no controls. */
  canEdit?: boolean
  spaceNames: Readonly<Record<string, string>>
  /** Item ids that overlap unavailable time. */
  clashes: ReadonlySet<string>
  teamById: ReadonlyMap<string, SuiteTeamMember>
  planById: ReadonlyMap<string, SuitePlan>
  itemById: ReadonlyMap<string, SuiteItem>
  taskById: ReadonlyMap<string, SuiteTask>
}

/** Where a click on empty calendar asked for a quick add: the day, the half hour (null on a day grid
 *  or the all-day row), and where on screen the pointer was. */
export interface QuickAnchor {
  day: string
  startMin: number | null
  x: number
  y: number
}

/** True for a click that landed on the empty part of a cell, not on a chip, card or button inside it. */
export function isEmptyClick(e: { target: EventTarget | null; currentTarget: EventTarget | null }): boolean {
  const el = e.target as HTMLElement | null
  return !!el && !el.closest('button, a, [draggable="true"], input, select, textarea')
}
