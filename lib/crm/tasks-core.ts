// CRM TASKS, the pure half — vocabulary, builders, filters and counts for `crm_tasks` (ADR-628).
//
// 🔴 WHY THIS IS ITS OWN FILE (LIVE-037, and lib/spaces/membership-core.ts is the precedent).
// lib/crm/tasks.ts documented itself as two halves in its own header — "the PURE builders +
// filters have no Supabase/Next imports, so they are unit-testable in isolation" — and that was
// true of the CODE and false of the FILE. The IO half imports `createAdminClient`, so ANY client
// component importing `filterTasks` for its own list pulled the SERVICE-ROLE client into the
// browser graph. The Space to-do inbox (HYG-117) is the first client caller these helpers ever
// had, and it made the latent seam a real one.
//
// Everything here is re-exported from lib/crm/tasks.ts, so no server caller changes.
// CLIENT code must import from HERE.

// ── Vocabulary (kept in lock-step with the code default in the migration) ─────────────────────────

export type TaskStatus = 'open' | 'done' | 'snoozed'
export const TASK_STATUSES: readonly TaskStatus[] = ['open', 'done', 'snoozed']

/** The filter buckets the Tasks surface offers (mine / all / overdue / by-contact). Pure `filterTasks`
 *  reads one of these against a caller's viewer id + an optional contact id. */
export type TaskFilter = 'mine' | 'all' | 'overdue' | 'by-contact' | 'by-plan'
export const TASK_FILTERS: readonly TaskFilter[] = ['mine', 'all', 'overdue', 'by-contact', 'by-plan']

const MAX_TITLE_LEN = 200
const MAX_NOTES_LEN = 4_000

/** What a caller (a server action) hands in to create one task. camelCase; normalized and validated
 *  by `buildTaskInsert`. */
export interface CreateTaskInput {
  /** The staff member who should do it (defaults to the creator when omitted). */
  assigneeProfileId?: string | null
  /** The staff member filing the task (audit). */
  createdBy: string
  title: string
  notes?: string | null
  /** ISO timestamp the follow-up is due (optional). */
  dueAt?: string | null
  /** The contact this follow-up is about (optional: a standalone to-do has none). */
  contactId?: string | null
  /** When set, this follow-up belongs to a Space Plan (ADR-1386). */
  planId?: string | null
  /** Days before (negative) or after (positive) the Production date. */
  dueOffsetDays?: number | null
}

/** One task row as the app consumes it (camelCase). */
export interface CrmTask {
  id: string
  spaceId: string | null
  contactId: string | null
  assigneeProfileId: string | null
  title: string
  notes: string | null
  dueAt: string | null
  status: TaskStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
  planId: string | null
  dueOffsetDays: number | null
}

/** The snake_case row shape written to `crm_tasks` (what the insert sends). */
export interface TaskInsert {
  space_id: string | null
  contact_id: string | null
  assignee_profile_id: string | null
  title: string
  notes: string | null
  due_at: string | null
  status: TaskStatus
  created_by: string
  plan_id?: string | null
  due_offset_days?: number | null
}

function oneLine(raw: unknown, cap: number): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, cap)
  return clean.length ? clean : null
}

function multiLine(raw: unknown, cap: number): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.trim().slice(0, cap)
  return clean.length ? clean : null
}

// ── PURE: validate + normalize one row (no IO, fully testable) ────────────────────────────────────

/**
 * Build the snake_case insert row from a caller's input, or return `null` when the input is invalid
 * (a missing creator or a blank title). FAIL-CLOSED: the assignee defaults to the creator, the status
 * is always the fresh 'open', and copy fields are trimmed + length-capped. Pure and deterministic.
 */
export function buildTaskInsert(input: CreateTaskInput, spaceId?: string | null): TaskInsert | null {
  const createdBy = typeof input.createdBy === 'string' ? input.createdBy.trim() : ''
  const title = oneLine(input.title, MAX_TITLE_LEN)
  if (!createdBy || !title) return null

  const assignee =
    typeof input.assigneeProfileId === 'string' && input.assigneeProfileId.trim().length
      ? input.assigneeProfileId.trim()
      : createdBy

  const contactId =
    typeof input.contactId === 'string' && input.contactId.trim().length ? input.contactId.trim() : null

  const planId =
    typeof input.planId === 'string' && input.planId.trim().length ? input.planId.trim() : null

  const dueOffset =
    typeof input.dueOffsetDays === 'number' && Number.isInteger(input.dueOffsetDays) ? input.dueOffsetDays : null

  const dueAt =
    typeof input.dueAt === 'string' && !Number.isNaN(Date.parse(input.dueAt))
      ? new Date(input.dueAt).toISOString()
      : null

  return {
    space_id: typeof spaceId === 'string' && spaceId.trim().length ? spaceId.trim() : null,
    contact_id: contactId,
    assignee_profile_id: assignee,
    title,
    notes: multiLine(input.notes, MAX_NOTES_LEN),
    due_at: dueAt,
    status: 'open',
    created_by: createdBy,
    plan_id: planId,
    due_offset_days: dueOffset,
  }
}

/** Whether a task is OVERDUE: open (not done/snoozed) with a due date already in the past. Pure; takes
 *  `now` so it is deterministic in tests. A task with no due date is never overdue. */
export function isOverdue(task: Pick<CrmTask, 'status' | 'dueAt'>, now: number = Date.now()): boolean {
  if (task.status !== 'open') return false
  if (!task.dueAt) return false
  const due = Date.parse(task.dueAt)
  if (Number.isNaN(due)) return false
  return due < now
}

/** Filter a list of tasks by one of the surface buckets. Pure and deterministic.
 *  - `mine`: open/snoozed tasks assigned to `viewerId` (the caller's own live queue).
 *  - `all`: every task (no assignee/status filter).
 *  - `overdue`: tasks that are open + past due (isOverdue).
 *  - `by-contact`: tasks for `contactId` (all statuses); empty when no contactId is given.
 *  Done tasks are dropped from `mine` so the working queue is not cluttered by finished work. */
export function filterTasks(
  tasks: readonly CrmTask[],
  filter: TaskFilter,
  opts: { viewerId?: string | null; contactId?: string | null; planId?: string | null; now?: number } = {},
): CrmTask[] {
  const list = tasks ?? []
  const now = opts.now ?? Date.now()
  switch (filter) {
    case 'mine':
      return list.filter((t) => t.assigneeProfileId === opts.viewerId && t.status !== 'done')
    case 'overdue':
      return list.filter((t) => isOverdue(t, now))
    case 'by-contact':
      return opts.contactId ? list.filter((t) => t.contactId === opts.contactId) : []
    case 'by-plan':
      return opts.planId ? list.filter((t) => t.planId === opts.planId) : []
    case 'all':
    default:
      return [...list]
  }
}

/** Sort tasks for display: OPEN first, then snoozed, then done; within a status, soonest due first
 *  (a task with no due date sinks below dated ones); newest-created breaks a remaining tie. Pure and
 *  deterministic (never mutates the input). */
export function sortTasks(tasks: readonly CrmTask[]): CrmTask[] {
  const statusRank: Record<TaskStatus, number> = { open: 0, snoozed: 1, done: 2 }
  return [...(tasks ?? [])].sort((a, b) => {
    const sr = statusRank[a.status] - statusRank[b.status]
    if (sr !== 0) return sr
    const da = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY
    const dbb = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY
    if (da !== dbb) return da - dbb
    const ca = Date.parse(a.createdAt) || 0
    const cb = Date.parse(b.createdAt) || 0
    return cb - ca
  })
}

/** A small count summary for the Tasks header StatCards. Pure. */
export interface TaskCounts {
  open: number
  overdue: number
  snoozed: number
  done: number
}
export function summarizeTasks(tasks: readonly CrmTask[], now: number = Date.now()): TaskCounts {
  const list = tasks ?? []
  return {
    open: list.filter((t) => t.status === 'open').length,
    overdue: list.filter((t) => isOverdue(t, now)).length,
    snoozed: list.filter((t) => t.status === 'snoozed').length,
    done: list.filter((t) => t.status === 'done').length,
  }
}
