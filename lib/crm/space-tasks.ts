// PER-SPACE TASKS — the owner-gated, space-scoped WRITE layer for a Space CRM's tasks (CRM-STRATEGY
// §6/§7). A task is a crm_tasks row with no plan_id (HYG-251: the one task table, beside Plan to-dos and
// the operator queue): a title, an optional due date (due_at), an optional link to a deal (deal_id)
// and/or a contact (contact_id), and a completion stamp (completed_at, with status 'done'). Reads live in lib/crm/pipeline.ts (getSpaceTasks / partitionTasks, fail-safe); this
// module owns create / edit / complete / reopen / delete, all gated + scoped.
//
// SHAPE (mirrors lib/crm/client-notes.ts): this module has NO 'use server' directive, so it can ALSO
// export the pure helpers (title normalization, due-date parsing) and the types the surfaces import.
// The thin 'use server' wrappers the CLIENT panel calls live in lib/crm/space-tasks-actions.ts; SERVER
// components import the read straight from lib/crm/pipeline.ts.
//
// AUTHORIZATION (the gate, end to end):
//   • Every write resolves the caller and confirms they may EDIT this Space (getSpaceCapabilities
//     canEditProfile: owner / admin / editor), exactly like client-notes. A non-editor / anonymous
//     caller writes nothing and gets an error (fail-closed).
//   • Every write is SCOPED to the Space: an INSERT stamps space_id; an UPDATE / DELETE filters BOTH
//     id AND space_id AND plan_id is null, so a task id from another Space (or a Plan to-do, which its
//     Plan owns) is a no-op, never a cross-space mutation. A deal / contact a task links to is confirmed to belong to
//     THIS Space before the link is written (no cross-space attach).
// crm_tasks is not in the generated DB types yet, so the writes go through the untyped admin client
// (ADR-246), matching lib/crm/pipeline.ts and lib/crm/tasks.ts.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getDeal, getContact } from '@/lib/crm/pipeline'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// A generous cap so a hostile write can never store an unbounded title; trims on write.
const MAX_TITLE_LEN = 280

// ── PURE: input normalization (no IO, fully testable) ───────────────────────────────────────────

/** Trim + length-cap a raw task title to a clean string. Anything non-string collapses to ''. An
 *  empty result is the caller's signal to REJECT the write (a task must have a title). Pure. */
export function normalizeTaskTitle(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LEN)
}

/** Parse a raw due-date input to an ISO string, or null when it is absent / blank / unparseable.
 *  Accepts a date (`2026-06-30`) or a full timestamp; fail-soft (a bad value becomes "no due date"
 *  rather than an error). Pure + deterministic. */
export function parseDueDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString()
}

/** What a task create / edit carries. `dealId` / `contactId` are optional links; absent leaves them
 *  unset (create) or unchanged (edit, when the key is omitted). */
export interface TaskInput {
  title?: string
  dueAt?: string | null
  dealId?: string | null
  contactId?: string | null
}

// ── Authorization seam: the owner gate, returning the resolved profile id when allowed ──────────

/** Resolve the caller and confirm they may edit this Space (owner / admin / editor). Returns the
 *  caller's profile id when allowed, or null otherwise. Every task write requires this. */
async function requireSpaceEditor(spaceId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, profileId)
  return caps.canEditProfile ? profileId : null
}

type Scoped = { eq: (col: string, val: string) => { eq: (col: string, val: string) => { is: (col: string, val: null) => Promise<{ error: unknown }> } } }

/** The untyped crm_tasks admin-client seam (the table is not in the generated DB types yet, ADR-246).
 *  One place so every write uses the same loose typing as lib/crm/pipeline.ts. */
function tasks(): {
  insert: (rows: Record<string, unknown>[]) => {
    select: (cols: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> }
  }
  update: (patch: Record<string, unknown>) => Scoped
  delete: () => Scoped
} {
  const db = createAdminClient() as unknown as { from: (t: string) => never }
  return db.from('crm_tasks')
}

/** Confirm a deal belongs to THIS Space; returns its id when valid, else null (no cross-space link). */
async function validDealLink(dealId: string | null | undefined, spaceId: string): Promise<string | null> {
  const id = (dealId ?? '').trim()
  if (!id) return null
  const deal = await getDeal(id, spaceId)
  return deal ? deal.id : null
}

/** Confirm a contact belongs to THIS Space; returns its id when valid, else null (no cross-space link). */
async function validContactLink(contactId: string | null | undefined, spaceId: string): Promise<string | null> {
  const id = (contactId ?? '').trim()
  if (!id) return null
  const contact = await getContact(id, spaceId)
  return contact ? contact.id : null
}

/** Revalidate the surface a Space task shows on (the CRM board). */
function revalidateSpace(slug: string | null | undefined): void {
  if (!slug) return
  revalidatePath(`/spaces/${slug}/crm`)
}

// ── PUBLIC SERVER ACTIONS (all owner-gated + space-scoped) ──────────────────────────────────────

/**
 * Create a task for a Space. Gated on canEditProfile + space-scoped: the title must be non-empty
 * (normalized + length-capped), an optional due date is parsed (a bad value becomes no due date), and
 * an optional deal / contact link is confirmed to belong to THIS Space before it is written. The row
 * is stamped with space_id + the author. Returns the new task id. Fail-closed on permission.
 */
export async function createTask(
  spaceId: string,
  input: TaskInput,
  slug?: string,
): Promise<ActionResult<{ id: string }>> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return fail('You do not have permission to add tasks for this space.')

  const title = normalizeTaskTitle(input.title)
  if (!title) return fail('Write a task first.')

  const [dealId, contactId] = await Promise.all([
    validDealLink(input.dealId, spaceId),
    validContactLink(input.contactId, spaceId),
  ])

  try {
    const { data, error } = await tasks()
      .insert([
        {
          space_id: spaceId,
          title,
          status: 'open',
          due_at: parseDueDate(input.dueAt),
          deal_id: dealId,
          contact_id: contactId,
          created_by: editorId,
        },
      ])
      .select('id')
      .maybeSingle()
    if (error || !data) return fail('Could not save the task. Try again.')
    revalidateSpace(slug)
    return ok({ id: data.id })
  } catch {
    return fail('Could not save the task. Try again.')
  }
}

/**
 * Edit a task (title / due date / links). Gated on canEditProfile and space-scoped: the UPDATE filters
 * id AND space_id AND plan_id is null, so a task id from another Space (or a Plan to-do) is a no-op.
 * Only the keys present in `patch` are written. A title, when given, must be non-empty. Fail-closed.
 */
export async function updateTask(
  spaceId: string,
  taskId: string,
  patch: TaskInput,
  slug?: string,
): Promise<ActionResult> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return fail('You do not have permission to edit tasks for this space.')

  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const title = normalizeTaskTitle(patch.title)
    if (!title) return fail('A task needs a title.')
    row.title = title
  }
  if (patch.dueAt !== undefined) row.due_at = parseDueDate(patch.dueAt)
  if (patch.dealId !== undefined) row.deal_id = await validDealLink(patch.dealId, spaceId)
  if (patch.contactId !== undefined) row.contact_id = await validContactLink(patch.contactId, spaceId)

  if (Object.keys(row).length === 0) return ok()
  row.updated_at = new Date().toISOString()

  try {
    const { error } = await tasks()
      .update(row)
      .eq('id', taskId)
      .eq('space_id', spaceId)
      .is('plan_id', null)
    if (error) return fail('Could not save the task. Try again.')
    revalidateSpace(slug)
  } catch {
    return fail('Could not save the task. Try again.')
  }
  return ok()
}

/**
 * Mark a task complete or reopen it. Gated on canEditProfile and space-scoped (id AND space_id AND
 * plan_id is null), so a cross-space id or a Plan to-do is a no-op. `done` true sets status 'done' and
 * stamps completed_at = now; false sets it back to 'open' and clears the stamp. Fail-closed on permission.
 */
export async function setTaskDone(
  spaceId: string,
  taskId: string,
  done: boolean,
  slug?: string,
): Promise<ActionResult> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return fail('You do not have permission to edit tasks for this space.')

  try {
    const now = new Date().toISOString()
    const { error } = await tasks()
      .update({ status: done ? 'done' : 'open', completed_at: done ? now : null, updated_at: now })
      .eq('id', taskId)
      .eq('space_id', spaceId)
      .is('plan_id', null)
    if (error) return fail('Could not update the task. Try again.')
    revalidateSpace(slug)
  } catch {
    return fail('Could not update the task. Try again.')
  }
  return ok()
}

/**
 * Delete a task. Gated on canEditProfile and space-scoped (id AND space_id AND plan_id is null), so a
 * task id from another Space (or a Plan to-do) can never be deleted through this Space's context.
 * Fail-closed on permission.
 */
export async function deleteTask(spaceId: string, taskId: string, slug?: string): Promise<ActionResult> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return fail('You do not have permission to delete tasks for this space.')

  try {
    const { error } = await tasks().delete().eq('id', taskId).eq('space_id', spaceId).is('plan_id', null)
    if (error) return fail('Could not delete the task. Try again.')
    revalidateSpace(slug)
  } catch {
    return fail('Could not delete the task. Try again.')
  }
  return ok()
}
