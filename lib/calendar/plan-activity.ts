// THE PLAN'S OWN RECORD (PROG-CAL7 Together, LIVE-543). Every door that changes a Plan writes one
// row: who, from which Space, what kind, and the sentence the door reported. Nothing here does IO.
// The session write and read live in lib/calendar/plan-activity-store.ts; the doors are the
// calendar actions (plan-actions, task-actions, entry-actions, vera-calendar-actions).
//
// WHY A SEPARATE RECORD. The Vera change log records what Vera applied, keyed by batch. A team
// working a Plan with another team needs to know what a PERSON did by hand, per Plan: a date moved,
// a to-do ticked, the stage changed, a share offered. The row is the fact; the notification a fact
// deserves (LIVE-545) fans out from it.

export const PLAN_ACTIVITY_KINDS = [
  'stage',
  'date_added',
  'date_moved',
  'todo_added',
  'todo_done',
  'todo_assigned',
  'shared',
  'share_answered',
  'share_revoked',
  'field',
  'comment',
] as const
export type PlanActivityKind = (typeof PLAN_ACTIVITY_KINDS)[number]

export const PLAN_ACTIVITY_SUMMARY_MAX = 500
/** How many rows the drawer shows: the latest, newest first. */
export const PLAN_ACTIVITY_SHOWN = 20

/** What a door hands the store after its change landed. */
export interface PlanActivityInput {
  planId: string
  actorProfileId: string
  actorSpaceId: string
  kind: PlanActivityKind
  summary: string
}

/** A `space_plan_activity` row as the session client returns it. */
export interface PlanActivityRow {
  id: string
  plan_id: string
  actor_profile_id: string | null
  actor_space_id: string
  kind: string
  summary: string
  created_at: string
}

/** One row as the drawer renders it, names resolved server-side. */
export interface PlanActivityView {
  id: string
  planId: string
  kind: PlanActivityKind
  summary: string
  createdAt: string
  actorProfileId: string | null
  actorName: string | null
  spaceName: string | null
  mine: boolean
}

export function planActivityKind(value: unknown): PlanActivityKind | null {
  return typeof value === 'string' && (PLAN_ACTIVITY_KINDS as readonly string[]).includes(value) ? (value as PlanActivityKind) : null
}

/** A summary bounded to what the column takes. A door's sentence is never dropped, only cut. */
export function boundSummary(summary: string): string {
  const s = summary.replace(/\s+/g, ' ').trim()
  return s.length > PLAN_ACTIVITY_SUMMARY_MAX ? `${s.slice(0, PLAN_ACTIVITY_SUMMARY_MAX - 1)}…` : s
}

export function mapPlanActivityRow(
  row: PlanActivityRow,
  names: { actorName: string | null; spaceName: string | null },
  callerProfileId: string | null,
): PlanActivityView {
  return {
    id: row.id,
    planId: row.plan_id,
    kind: planActivityKind(row.kind) ?? 'field',
    summary: row.summary,
    createdAt: row.created_at,
    actorProfileId: row.actor_profile_id,
    actorName: names.actorName,
    spaceName: names.spaceName,
    mine: row.actor_profile_id !== null && row.actor_profile_id === callerProfileId,
  }
}

/** Newest first, the latest `limit` rows. Stable on ties. */
export function latestActivity<T extends { createdAt: string; id: string }>(rows: readonly T[], limit = PLAN_ACTIVITY_SHOWN): T[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, Math.max(0, limit))
}

/** Who did it, as a person reads it. The actor's name when it resolved, else their Space, else the
 *  honest fallback. No long dash anywhere. */
export function actorWords(a: Pick<PlanActivityView, 'actorName' | 'spaceName' | 'mine'>): string {
  if (a.mine) return 'You'
  if (a.actorName && a.spaceName) return `${a.actorName} (${a.spaceName})`
  if (a.actorName) return a.actorName
  if (a.spaceName) return `Someone at ${a.spaceName}`
  return 'Someone on the Plan'
}
