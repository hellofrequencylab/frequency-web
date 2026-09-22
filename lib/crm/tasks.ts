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

// ── The pure half lives in ./tasks-core (LIVE-037): a client component importing `filterTasks`
//    from here would pull the service-role client below into the browser graph. Re-exported so
//    every server caller is unchanged.
export * from './tasks-core'
import { TASK_STATUSES, buildTaskInsert, type CrmTask, type CreateTaskInput, type TaskInsert, type TaskStatus } from './tasks-core'

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
  plan_id: string | null
  due_offset_days: number | null
}

const ROW_COLS =
  'id, space_id, contact_id, assignee_profile_id, title, notes, due_at, status, created_by, created_at, updated_at, plan_id, due_offset_days'

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
    planId: r.plan_id,
    dueOffsetDays: r.due_offset_days,
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

/** The column patch one status move writes. Pure, so the shape is testable without a client:
 *  an unknown status or an unparseable `dueAt` yields null / no due column rather than a write. */
export function taskStatusPatch(
  status: TaskStatus,
  opts: { dueAt?: string | null; now?: number } = {},
): Record<string, unknown> | null {
  if (!TASK_STATUSES.includes(status)) return null
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date(opts.now ?? Date.now()).toISOString(),
  }
  if (typeof opts.dueAt === 'string' && !Number.isNaN(Date.parse(opts.dueAt))) {
    patch.due_at = new Date(opts.dueAt).toISOString()
  }
  return patch
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
  const patch = taskStatusPatch(status, opts)
  if (!id || !patch) return false
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

/** The untyped update-builder shape the scoped writer chains over. */
interface ScopedUpdateQuery {
  eq: (col: string, val: string) => ScopedUpdateQuery
  select: (cols: string) => PromiseLike<{ data: { id: string }[] | null; error: unknown }>
}

/**
 * Move ONE task to a new status INSIDE a scope the caller has already been authorized for.
 *
 * WHY A SECOND WRITER. `updateTaskStatus` takes a bare id, which is right for the platform-staff
 * Tasks board (one admin, one root Space) and wrong for a Space owner: the id arrives from that
 * owner’s browser, and crm_tasks is reached through the service-role client, so an id belonging to
 * ANOTHER Space would be moved with no complaint. Here the `id` predicate is joined by `space_id`
 * (and `plan_id`, when the caller is working inside one Plan), and the write must MATCH A ROW to
 * count — a foreign id changes nothing and the caller gets `false` instead of a silent success.
 */
export async function updateTaskStatusInScope(
  taskId: string,
  status: TaskStatus,
  scope: { spaceId: string; planId?: string | null },
): Promise<boolean> {
  const id = typeof taskId === 'string' ? taskId.trim() : ''
  const spaceId = typeof scope?.spaceId === 'string' ? scope.spaceId.trim() : ''
  const patch = taskStatusPatch(status)
  if (!id || !spaceId || !patch) return false
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { update: (p: Record<string, unknown>) => ScopedUpdateQuery }
    }
    let q = db.from('crm_tasks').update(patch).eq('id', id).eq('space_id', spaceId)
    if (typeof scope.planId === 'string' && scope.planId.trim().length) {
      q = q.eq('plan_id', scope.planId.trim())
    }
    const { data, error } = await q.select('id')
    return !error && !!data?.length
  } catch {
    return false
  }
}

/** The column patch one re-anchor writes. Pure: an unparseable instant yields null, never a write. */
export function taskDuePatch(dueAt: string, now?: number): Record<string, unknown> | null {
  if (typeof dueAt !== 'string' || Number.isNaN(Date.parse(dueAt))) return null
  return {
    due_at: new Date(dueAt).toISOString(),
    updated_at: new Date(now ?? Date.now()).toISOString(),
  }
}

/**
 * Re-anchor a batch of to-dos INSIDE one Space and one Plan: the write half of relative scheduling.
 *
 * SCOPED FOR THE SAME REASON `updateTaskStatusInScope` IS. crm_tasks is reached through the
 * service-role client, so an id that arrived from a browser is not evidence of anything. Every
 * statement here carries `space_id` AND `plan_id` beside the row id, so a to-do belonging to another
 * Space matches nothing and is counted as a miss rather than moved.
 *
 * Returns how many rows actually moved. A partial failure is reported as a smaller number, never as
 * a clean success — the caller surfaces the shortfall instead of a date silently staying put.
 */
export async function reanchorTaskDuesInScope(
  moves: readonly { id: string; dueAt: string }[],
  scope: { spaceId: string; planId: string },
): Promise<number> {
  const spaceId = typeof scope?.spaceId === 'string' ? scope.spaceId.trim() : ''
  const planId = typeof scope?.planId === 'string' ? scope.planId.trim() : ''
  if (!spaceId || !planId || !moves?.length) return 0
  let moved = 0
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { update: (p: Record<string, unknown>) => ScopedUpdateQuery }
    }
    for (const m of moves) {
      const id = typeof m?.id === 'string' ? m.id.trim() : ''
      const patch = id ? taskDuePatch(m.dueAt) : null
      if (!patch) continue
      const { data, error } = await db
        .from('crm_tasks')
        .update(patch)
        .eq('id', id)
        .eq('space_id', spaceId)
        .eq('plan_id', planId)
        .select('id')
      if (!error && data?.length) moved += 1
    }
  } catch {
    return moved
  }
  return moved
}

/** Filters for a task read. A Studio read scopes by `spaceId`; a per-contact read adds `contactId`. */
export interface ListTasksFilter {
  spaceId?: string | null
  contactId?: string | null
  planId?: string | null
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
    if (filter.planId) q = q.eq('plan_id', filter.planId)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error || !data) return []
    return data.map(mapTaskRow)
  } catch {
    return []
  }
}
