// CRM TASKS — the operator follow-up queue behind the Resonance CRM Tasks module (ADR-628,
// docs/DECISIONS.md). One append point + one read for the staff "call this person back Thursday"
// to-do list, over the `crm_tasks` table. This is the OPERATOR's work queue; it is NOT the
// member-facing crew_tasks volunteer assignment (docs/NAMING.md "Task"), and never touches the crew
// economy.
//
// SHAPE (mirrors lib/crm/interactions.ts): the PURE builders + filters (`buildTaskInsert`,
// `filterTasks`, `sortTasks`, `isOverdue`) have no Supabase/Next imports, so they are unit-testable
// in isolation. The IO (`createTask` / `updateTaskStatus` / `listTasks`) reaches the table through the
// untyped admin client (the table is not in the generated DB types yet, ADR-246).
//
// authz-delegated: crm_tasks is a service-role, staff-scoped table (RLS on, no client policy). Every
// write is STAMPED with the staff caller the calling action already authorized; the gate lives at the
// call site (the staff-gated Studio surface), exactly like lib/crm/interactions.ts.

import { createAdminClient } from '@/lib/supabase/admin'

// ── Vocabulary (kept in lock-step with the code default in the migration) ─────────────────────────

export type TaskStatus = 'open' | 'done' | 'snoozed'
export const TASK_STATUSES: readonly TaskStatus[] = ['open', 'done', 'snoozed']

/** The filter buckets the Tasks surface offers (mine / all / overdue / by-contact). Pure `filterTasks`
 *  reads one of these against a caller's viewer id + an optional contact id. */
export type TaskFilter = 'mine' | 'all' | 'overdue' | 'by-contact'
export const TASK_FILTERS: readonly TaskFilter[] = ['mine', 'all', 'overdue', 'by-contact']

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
  opts: { viewerId?: string | null; contactId?: string | null; now?: number } = {},
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

// ── IO: the untyped admin-client seam (crm_tasks is not in generated types yet, ADR-246) ──────────

type TaskRow = {
  id: string
  space_id: string | null
  contact_id: string | null
  assignee_profile_id: string | null
  title: string
  notes: string | null
  due_at: string | null
  status: string
  created_by: string | null
  created_at: string
  updated_at: string
}

const ROW_COLS =
  'id, space_id, contact_id, assignee_profile_id, title, notes, due_at, status, created_by, created_at, updated_at'

/** The untyped query-builder shape listTasks chains over (crm_tasks is not in generated types yet). */
interface TaskQuery {
  eq: (col: string, val: string) => TaskQuery
  order: (col: string, opts: { ascending: boolean }) => TaskQuery
  limit: (n: number) => Promise<{ data: TaskRow[] | null; error: unknown }>
}

/** Map a raw row to a typed CrmTask, fail-closed: an unknown status falls back to 'open' so a future
 *  value the build doesn't know never surfaces mislabeled. */
export function mapTaskRow(r: TaskRow): CrmTask {
  const status = TASK_STATUSES.includes(r.status as TaskStatus) ? (r.status as TaskStatus) : 'open'
  return {
    id: r.id,
    spaceId: r.space_id,
    contactId: r.contact_id,
    assigneeProfileId: r.assignee_profile_id,
    title: r.title,
    notes: r.notes,
    dueAt: r.due_at,
    status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * Create one task. Returns the new task id, or null on an invalid input or a write error (FAIL-SAFE).
 * The write is stamped with the space/creator the caller (a staff-gated action) already authorized.
 */
export async function createTask(input: CreateTaskInput, spaceId?: string | null): Promise<{ id: string } | null> {
  const row = buildTaskInsert(input, spaceId)
  if (!row) return null
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        insert: (rows: TaskInsert[]) => {
          select: (c: string) => { maybeSingle: () => Promise<{ data: TaskRow | null; error: unknown }> }
        }
      }
    }
    const { data, error } = await db.from('crm_tasks').insert([row]).select(ROW_COLS).maybeSingle()
    if (error || !data) return null
    return { id: data.id }
  } catch {
    return null
  }
}

/**
 * Move a task to a new status (open / done / snoozed). Returns true on success. FAIL-SAFE: false on an
 * unknown status or a write error. `updated_at` is bumped so the board reorders. When snoozing, a
 * caller may pass `dueAt` to push the follow-up out; omit it to leave the due date unchanged.
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  opts: { dueAt?: string | null } = {},
): Promise<boolean> {
  const id = typeof taskId === 'string' ? taskId.trim() : ''
  if (!id || !TASK_STATUSES.includes(status)) return false
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (typeof opts.dueAt === 'string' && !Number.isNaN(Date.parse(opts.dueAt))) {
    patch.due_at = new Date(opts.dueAt).toISOString()
  }
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        update: (p: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
      }
    }
    const { error } = await db.from('crm_tasks').update(patch).eq('id', id)
    return !error
  } catch {
    return false
  }
}

/** Filters for a task read. A Studio read scopes by `spaceId`; a per-contact read adds `contactId`. */
export interface ListTasksFilter {
  spaceId?: string | null
  contactId?: string | null
  limit?: number
}

/**
 * Read a slice of tasks for a scope, newest-created first (the caller re-sorts for display via
 * sortTasks). Service-role read, FAIL-SAFE (empty array on any error). The caller is responsible for
 * having authorized the scope it asks for (the staff-gated Studio surface).
 */
export async function listTasks(filter: ListTasksFilter = {}): Promise<CrmTask[]> {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500)
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => TaskQuery }
    }
    let q = db.from('crm_tasks').select(ROW_COLS)
    if (filter.spaceId) q = q.eq('space_id', filter.spaceId)
    if (filter.contactId) q = q.eq('contact_id', filter.contactId)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error || !data) return []
    return data.map(mapTaskRow)
  } catch {
    return []
  }
}
