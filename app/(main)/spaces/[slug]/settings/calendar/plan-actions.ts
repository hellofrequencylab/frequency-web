'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, isError, ok, type ActionResult } from '@/lib/action-result'
import { parsePlanInput, planPublishLag, planTargetDef, type PlanInput } from '@/lib/calendar/plans'
import { planStageTransition, type WorkflowStage } from '@/lib/calendar/workflow-board'
import {
  attachEntryToPlan,
  createPenciledPlanRows,
  getSpacePlan,
  insertPlaybook,
  insertSpacePlan,
  listPlaybooks,
  listSpacePlans,
  planHasPublishedEntry,
  updateSpacePlan,
  transitionSpacePlanRows,
} from '@/lib/calendar/plans-store'
import { copyPlaybookToPlan, runItAgain } from '@/lib/calendar/playbooks'
import { createTask, listTasks, type CrmTask } from '@/lib/crm/tasks'
import { getCalendarEntryRow } from '@/lib/calendar/entries-store'
import { parseEntryInput, type EntryInput } from '@/lib/calendar/entries'
import { productionPrefill, readinessGaps } from '@/lib/calendar/production-prefill'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { buildVeraProposal } from '@/lib/calendar/vera-plan'
import { createClient } from '@/lib/supabase/server'
import { listEventsForSpace } from '@/lib/events/store'
import { formatEventWhen } from '@/lib/time/zone'
import { setEventPlan } from '@/lib/events/plan-link'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveEditor(slug: string): Promise<{ spaceId: string; profileId: string } | null> {
  if (typeof slug !== 'string') return null
  const caller = await getCallerProfile()
  if (!caller?.id) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile || !spaceFunctionAccess(space, 'events', caps.role)) return null
  return { spaceId: space.id, profileId: caller.id }
}

function revalidate(slug: string) {
  revalidatePath(`/spaces/${slug}/settings/calendar`)
  revalidatePath(`/spaces/${slug}/calendar`)
}

export async function saveSpacePlan(
  slug: string,
  planId: string | null,
  input: PlanInput,
): Promise<ActionResult<{ id: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (planId !== null && !UUID_RE.test(planId)) return fail('That Plan no longer exists.')
  const parsed = parsePlanInput(input)
  if ('error' in parsed) return fail(parsed.error)
  const { stage, ...details } = parsed.data
  const res = planId
    ? await updateSpacePlan(editor.spaceId, planId, details)
    : await insertSpacePlan(editor.spaceId, parsed.data, editor.profileId)
  if ('error' in res) return fail(res.error)
  if (planId) {
    const moved = await transitionPlanStageForEditor(editor.spaceId, planId, stage)
    if ('error' in moved) return fail(moved.error)
  }
  revalidate(slug)
  return ok({ id: res.data.id })
}

async function transitionPlanStageForEditor(spaceId: string, planId: string, stage: string) {
  const transition = planStageTransition(stage)
  if (!transition) return { error: 'Choose a valid Plan stage.' } as const
  return transitionSpacePlanRows(spaceId, planId, transition.stage)
}

/** The only operator action that changes lifecycle stage: the Plan leads and every linked date follows. */
export async function transitionPlanStage(
  slug: string,
  planId: string,
  stage: WorkflowStage,
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(planId)) return fail('That Plan no longer exists.')
  const moved = await transitionPlanStageForEditor(editor.spaceId, planId, stage)
  if ('error' in moved) return fail(moved.error)
  revalidate(slug)
  return ok()
}

export async function startPlanFromEntry(
  slug: string,
  entryId: string,
  title: string,
): Promise<ActionResult<{ id: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(entryId)) return fail('That date no longer exists.')
  const created = await saveSpacePlan(slug, null, { title })
  if (isError(created)) return created
  const attached = await attachEntryToPlan(editor.spaceId, entryId, created.data.id)
  if ('error' in attached) return fail(attached.error)
  revalidate(slug)
  return created
}

/** Create the smallest useful production record from the operator Calendar:
 * one titled date, represented by one pencil entry linked to one Plan. */
export async function createPenciledPlan(
  slug: string,
  title: string,
  dayKey: string,
  timeZone = 'UTC',
): Promise<ActionResult<{ id: string; entryId: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const parsedPlan = parsePlanInput({ title, stage: 'pencil', targetKind: 'event' })
  if ('error' in parsedPlan) return fail(parsedPlan.error)
  const input: EntryInput = {
    kind: 'pencil',
    title,
    allDay: true,
    startDate: dayKey,
    endDate: dayKey,
    timeZone,
    stage: 'pencil',
    blocksTime: false,
    showPublicly: false,
    planId: null,
  }
  const parsedEntry = parseEntryInput(input)
  if ('error' in parsedEntry) return fail(parsedEntry.error)
  const created = await createPenciledPlanRows(editor.spaceId, parsedPlan.data.title, parsedEntry.data)
  if ('error' in created) return fail(created.error)
  revalidate(slug)
  return ok({ id: created.data.planId, entryId: created.data.entryId })
}

export async function joinEntryToPlan(
  slug: string,
  entryId: string,
  planId: string,
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(entryId) || !UUID_RE.test(planId)) return fail('That Plan no longer exists.')
  const res = await attachEntryToPlan(editor.spaceId, entryId, planId)
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  return ok()
}

export async function addPlanTodo(
  slug: string,
  planId: string,
  title: string,
  dueAt?: string | null,
  dueOffsetDays?: number | null,
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(planId)) return fail('That Plan no longer exists.')
  const created = await createTask(
    {
      createdBy: editor.profileId,
      title,
      dueAt: dueAt ?? null,
      planId,
      dueOffsetDays: dueOffsetDays ?? null,
    },
    editor.spaceId,
  )
  if (!created) return fail('That to-do could not be saved.')
  revalidate(slug)
  return ok()
}

export async function listPlanTodos(slug: string, planId?: string): Promise<CrmTask[]> {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  const all = await listTasks({ spaceId: editor.spaceId, planId: planId ?? null, limit: 200 })
  return all
}

export async function productionHref(
  slug: string,
  planId: string,
  entryId?: string,
): Promise<ActionResult<{ href: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const plan = await getSpacePlan(editor.spaceId, planId)
  if (!plan) return fail('That Plan no longer exists.')
  const href = planTargetDef(plan.targetKind).createHref?.({
    spaceId: editor.spaceId,
    planId: plan.id,
    entryId,
  })
  if (!href) return fail('This Plan does not open a Studio. Mark the work done on the Plan itself.')
  return ok({ href })
}

export async function planReadiness(
  slug: string,
  planId: string,
  entryId: string | null,
): Promise<{ gaps: string[]; href: string | null }> {
  const editor = await resolveEditor(slug)
  if (!editor) return { gaps: [], href: null }
  const plan = await getSpacePlan(editor.spaceId, planId)
  if (!plan) return { gaps: [], href: null }
  const entry = entryId && UUID_RE.test(entryId) ? await getCalendarEntryRow(editor.spaceId, entryId) : null
  const prefill = entry ? productionPrefill(plan, entry) : null
  const required = EVENT_MANIFEST.fields
    .filter((f) => f.required)
    .map((f) => ({
      path: f.path,
      label: f.label,
      value: prefill ? String((prefill as unknown as Record<string, unknown>)[f.path] ?? '') : '',
    }))
  const todos = await listTasks({ spaceId: editor.spaceId, planId, limit: 100 })
  const openTodoCount = todos.filter((t) => t.status === 'open').length
  const href = planTargetDef(plan.targetKind).createHref?.({
    spaceId: editor.spaceId,
    planId: plan.id,
    entryId: entryId ?? undefined,
  })
  const gaps = readinessGaps({ required, openTodoCount })
  // THE GATE ON THE PUBLISH SEAM'S FAIL-SAFE (PROG-CAL3). Advancing the Plan on publish is
  // best-effort by design — see closeProductionSeam in app/(main)/events/actions.ts — so the lag it
  // can leave behind is derived from the data and shown HERE, where the operator can fix it with
  // one save, rather than living only in a log line nobody opens.
  const lag = planPublishLag({
    stage: plan.stage,
    hasPublishedEvent: await planHasPublishedEntry(editor.spaceId, plan.id),
  })
  if (lag) gaps.unshift(lag)
  return { gaps, href: href ?? null }
}

/** The Space's events, for putting one back on a Plan by hand. The repair door for a link that was
 *  never editable after create (PROG-CAL3): before this, `plan_id` could only be set at creation. */
export async function listPlanLinkableEvents(
  slug: string,
): Promise<{ id: string; title: string; whenLabel: string; planId: string | null }[]> {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  const rows = await listEventsForSpace(editor.spaceId, { limit: 100, includeUnpublished: true })
  return rows.map((ev) => ({
    id: ev.id,
    title: ev.title,
    whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'date' }),
    planId: ev.plan_id ?? null,
  }))
}

/** Attach an existing event to this Plan, or detach it when `eventId` is empty. */
export async function attachEventToPlan(
  slug: string,
  planId: string,
  eventId: string,
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(planId) || !UUID_RE.test(eventId)) return fail('Pick an event to link.')
  const res = await setEventPlan(eventId, planId, editor.spaceId)
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  revalidatePath('/events', 'layout')
  return ok()
}

export async function savePlaybook(
  slug: string,
  input: { title: string; eventType: string; taskTitles: string[]; notes: string | null },
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const res = await insertPlaybook(editor.spaceId, input, editor.profileId)
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  return ok()
}

export async function startPlanFromPlaybook(slug: string, playbookId: string): Promise<ActionResult<{ id: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const books = await listPlaybooks(editor.spaceId)
  const book = books.find((b) => b.id === playbookId)
  if (!book) return fail('That playbook is gone.')
  const seed = copyPlaybookToPlan(book)
  const created = await saveSpacePlan(slug, null, { title: seed.title, notes: seed.notes, playbookId: book.id })
  if (isError(created)) return created
  for (const title of seed.taskTitles) {
    await createTask({ createdBy: editor.profileId, title, planId: created.data.id }, editor.spaceId)
  }
  revalidate(slug)
  return created
}

export async function runPlanAgain(slug: string, planId: string): Promise<ActionResult<{ id: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const plan = await getSpacePlan(editor.spaceId, planId)
  if (!plan) return fail('That Plan no longer exists.')
  const todos = await listTasks({ spaceId: editor.spaceId, planId, limit: 100 })
  const seed = runItAgain({
    title: plan.title,
    notes: plan.notes,
    taskTitles: todos.map((t) => t.title),
  })
  const created = await saveSpacePlan(slug, null, { title: seed.title, notes: seed.notes, targetKind: plan.targetKind })
  if (isError(created)) return created
  for (const title of seed.taskTitles) {
    await createTask({ createdBy: editor.profileId, title, planId: created.data.id }, editor.spaceId)
  }
  revalidate(slug)
  return created
}

export async function veraPlanProposal(slug: string, planId: string) {
  const editor = await resolveEditor(slug)
  if (!editor) return null
  const plan = await getSpacePlan(editor.spaceId, planId)
  if (!plan) return null
  const todos = await listTasks({ spaceId: editor.spaceId, planId, limit: 50 })
  const today = new Date().toISOString().slice(0, 10)
  return buildVeraProposal({
    pastTaskTitles: todos.map((t) => t.title),
    busyDayKeys: [],
    preferredWeekdays: [0, 6],
    fromDayKey: today,
    gaps: readinessGaps({
      required: EVENT_MANIFEST.fields.filter((f) => f.required).map((f) => ({ path: f.path, label: f.label, value: plan.title })),
      openTodoCount: todos.filter((t) => t.status === 'open').length,
    }),
    recap: plan.stage === 'production' ? { title: plan.title, attendance: null, ranLate: false } : null,
  })
}

export async function acceptVeraChecklist(slug: string, planId: string, titles: string[]): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  for (const title of titles.slice(0, 20)) {
    await createTask({ createdBy: editor.profileId, title, planId }, editor.spaceId)
  }
  revalidate(slug)
  return ok()
}

export async function sharePlanWithSpace(
  slug: string,
  planId: string,
  guestSpaceId: string,
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(planId) || !UUID_RE.test(guestSpaceId)) return fail('Pick a Space to share with.')
  const db = await createClient()
  const { error } = await db.from('space_plan_shares' as never).insert({
    plan_id: planId,
    guest_space_id: guestSpaceId,
    status: 'accepted',
    requested_by: editor.profileId,
    responded_at: new Date().toISOString(),
    responded_by: editor.profileId,
  } as never)
  if (error) return fail('That Plan could not be shared.')
  revalidate(slug)
  return ok()
}

export async function rotatePrivateCalendarFeed(slug: string): Promise<ActionResult<{ token: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  const db = await createClient()
  await db
    .from('space_calendar_private_feeds' as never)
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq('space_id', editor.spaceId)
    .is('revoked_at', null)
  const { error } = await db.from('space_calendar_private_feeds' as never).insert({
    space_id: editor.spaceId,
    token,
    created_by: editor.profileId,
  } as never)
  if (error) return fail('The private feed could not be created.')
  revalidate(slug)
  return ok({ token })
}

export async function loadCalendarPlans(slug: string) {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  return listSpacePlans(editor.spaceId)
}

export async function loadPlaybooks(slug: string) {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  return listPlaybooks(editor.spaceId)
}
