// Beta Command Center: typed reads/writes for beta_tasks (the per-phase board).
//
// Reads ungated (layout gates entry); writes self-gate on the CONTENT WRITER
// gate. Server-only; untyped-admin handle until types regenerate.

import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { betaDb } from './db'
import { writerGate } from './guard'

export const TASK_STATUSES = ['not_started', 'in_progress', 'done', 'blocked'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface BetaTask {
  id: string
  phaseId: string
  title: string
  detail: string
  acceptance: string
  status: TaskStatus
  priority: TaskPriority
  position: number
  dueOn: string | null
  owner: string | null
}

const TASK_COLS =
  'id, phase_id, title, detail, acceptance, status, priority, position, due_on, owner'

function mapTask(r: Record<string, unknown>): BetaTask {
  return {
    id: String(r.id),
    phaseId: String(r.phase_id),
    title: String(r.title ?? ''),
    detail: String(r.detail ?? ''),
    acceptance: String(r.acceptance ?? ''),
    status: (r.status as TaskStatus) ?? 'not_started',
    priority: (r.priority as TaskPriority) ?? 'medium',
    position: Number(r.position ?? 0),
    dueOn: (r.due_on as string) ?? null,
    owner: (r.owner as string) ?? null,
  }
}

/** Tasks, optionally scoped to one phase, in board order. FAIL-SAFE to []. */
export async function listTasks(phaseId?: string): Promise<BetaTask[]> {
  try {
    let q = betaDb().from('beta_tasks').select(TASK_COLS)
    if (phaseId) q = q.eq('phase_id', phaseId)
    q = q.order('position', { ascending: true })
    const { data } = await q
    return (data ?? []).map(mapTask)
  } catch (err) {
    console.error('[beta] listTasks failed:', err)
    return []
  }
}

/** One task by id, or null. */
export async function getTask(id: string): Promise<BetaTask | null> {
  try {
    const { data } = await betaDb().from('beta_tasks').select(TASK_COLS).eq('id', id).maybeSingle()
    return data ? mapTask(data) : null
  } catch (err) {
    console.error('[beta] getTask failed:', err)
    return null
  }
}

/** Set a task's status. Content-writer gated. */
export async function updateTaskStatus(id: string, status: TaskStatus): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  if (!TASK_STATUSES.includes(status)) return fail('Unknown task status.')
  const { error } = await betaDb()
    .from('beta_tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return fail('Could not update the task.')
  revalidatePath('/admin/beta')
  return ok()
}

/** Persist a new task order within a phase (ids in the desired order). Content-writer gated. */
export async function reorderTasks(orderedIds: string[]): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const db = betaDb()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db
      .from('beta_tasks')
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
    if (error) return fail('Could not reorder the tasks.')
  }
  revalidatePath('/admin/beta')
  return ok()
}
