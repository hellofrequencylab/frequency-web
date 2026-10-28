// THE PLANNER'S RECORDS (Space calendar redesign, pass 0). Plain data the pure engine in this folder
// reads: no React, no Supabase, no clock. Every function takes `today` as an argument, so a test
// freezes time by passing a string and the Space time zone decides what "today" is upstream
// (lib/time/zone.ts dayInZone), never in here.
//
// Dates are YYYY-MM-DD day keys. Times are MINUTES since the Space's local midnight (wall clock, the
// convention lib/calendar/wall-clock.ts documents), so 7:30 PM is 1170 and nothing is a float.
// `CalendarEvent` (lib/calendar/item.ts) stays the render shape of the month grid; the adapters that
// turn it and the stored rows into these records belong to the data pass, not to this one.

export type PlannerKind =
  | 'event'
  | 'pencil'
  | 'planning'
  | 'production'
  | 'private'
  | 'unavailable'
  | 'todo'
  | 'cancelled'

/** The six Show tiles. A kind belongs to exactly one (lib/calendar/planner/kinds.ts). */
export type PlannerLayer = 'events' | 'works' | 'shared' | 'private' | 'unavailable' | 'todos'

/** A Plan's stage. `event` is the one the board calls Published. */
export type PlanStage = 'pencil' | 'planning' | 'production' | 'event' | 'cancelled'

export type TodoPhase = 'Before' | 'Day of' | 'After'

export interface PlannerItem {
  id: string
  title: string
  kind: PlannerKind
  /** First day. */
  date: string
  /** Last day (inclusive) when the item spans several. Absent or null = one day. */
  end?: string | null
  /** Start, in minutes since midnight. Null = all day. */
  startMin: number | null
  /** Length in minutes. Ignored when `startMin` is null. */
  durMin: number
  plan?: string | null
  owner?: string | null
  /** A held date's letter (A, B, C) while the Plan is still pencilled. */
  option?: string | null
  series?: boolean
  going?: number
  /** True for a date another Space hosts and this Space co-hosts, which carries no Plan of this Space's own. */
  shared?: boolean
}

export interface PlannerTask {
  id: string
  title: string
  /** Day it is due, or null for the inbox. */
  due: string | null
  /** Optional block of time on the due day, in minutes since midnight. */
  startMin?: number | null
  plan?: string | null
  owner?: string | null
  phase?: TodoPhase | null
  /** Signed days from the Plan's date (lib/calendar/relative-schedule.ts): negative = before. */
  dueOffsetDays?: number | null
  done: boolean
  /** Estimate in hours. Missing counts as half an hour. */
  estHours?: number | null
}

interface PlanSpaceRef {
  id: string
  role: 'Host' | 'Co-host'
  status: 'accepted' | 'pending'
}

export interface PlannerPlan {
  id: string
  title: string
  stage: PlanStage
  target: string
  owner?: string | null
  team: string[]
  /** The day a pencilled hold lapses, or null. */
  hold?: string | null
  spaces: PlanSpaceRef[]
}

/** Everything a view derives from. `hidden` is the Show tiles a person switched off. */
export interface PlannerData {
  items: readonly PlannerItem[]
  tasks: readonly PlannerTask[]
  plans: readonly PlannerPlan[]
  hidden?: Partial<Record<PlannerLayer, boolean>>
}
