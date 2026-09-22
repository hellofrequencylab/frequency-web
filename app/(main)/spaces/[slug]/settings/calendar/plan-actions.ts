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
  archiveSpacePlanRows,
  attachEntryToPlan,
  createPenciledPlanRows,
  getPlanAnchorDayKey,
  getSpacePlan,
  insertPlaybook,
  insertSpacePlan,
  listPlaybooks,
  listPlanPublishedEventIds,
  listSpacePlans,
  planHasPublishedEntry,
  updateSpacePlan,
  transitionSpacePlanRows,
} from '@/lib/calendar/plans-store'
import { copyPlaybookToPlan, runItAgain } from '@/lib/calendar/playbooks'
import {
  createTask,
  listTasks,
  reanchorTaskDuesInScope,
  updateTaskStatusInScope,
  type CrmTask,
} from '@/lib/crm/tasks'
import { moveAnchoredDues, normalizeOffsetDays, resolveDueFromOffset } from '@/lib/calendar/relative-schedule'
import { getCalendarEntryRow, listSpaceCalendarEntries } from '@/lib/calendar/entries-store'
import { listDayNotes } from '@/lib/calendar/day-notes-store'
import { parseEntryInput, type EntryInput } from '@/lib/calendar/entries'
import { productionPrefill, readinessGaps } from '@/lib/calendar/production-prefill'
import { availabilityWindow, busyDayKeysFor } from '@/lib/calendar/availability'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { buildVeraProposal } from '@/lib/calendar/vera-plan'
import { createClient } from '@/lib/supabase/server'
import { listPlanEventIds, setEventPlan } from '@/lib/events/plan-link'
import { loadPlanAttendance } from '@/lib/events/event-stats'
import { listPlanLinkableEventRows, listSpaceEventSpans } from '@/lib/calendar/admin-calendar'
import { dayInZone } from '@/lib/time/zone'

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

/**
 * The gate for anything that writes a PLAN id through the service-role task seam.
 *
 * `resolveEditor` proves the caller may edit THIS Space. It says nothing about the plan id the
 * browser sent, and crm_tasks is written with the admin client, so a plan id belonging to another
 * Space used to be accepted and stamped onto a to-do nobody in this Space could see. `getSpacePlan`
 * re-reads the plan on the CALLER session filtered by `space_id`, so the plan must be this Space's
 * and RLS must also allow it. Every plan-scoped task write goes through here.
 */
async function editorPlan(
  slug: string,
  planId: string,
): Promise<{ spaceId: string; profileId: string } | { error: string }> {
  const editor = await resolveEditor(slug)
  if (!editor) return { error: 'You do not have access to this calendar.' }
  if (typeof planId !== 'string' || !UUID_RE.test(planId)) return { error: 'That Plan no longer exists.' }
  const plan = await getSpacePlan(editor.spaceId, planId)
  if (!plan) return { error: 'That Plan no longer exists.' }
  return editor
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

/**
 * "Archive Plan" (HYG-120). The only way out for a Plan started by mistake, and what the e2e suite
 * tears its own Plans down with, since the test step holds no service-role key and can only go
 * through the product. Gated like every other Plan write: `editorPlan` proves the caller may edit
 * THIS Space and that the id is one of this Space's Plans.
 */
export async function archiveSpacePlan(slug: string, planId: string): Promise<ActionResult<void>> {
  const editor = await editorPlan(slug, planId)
  if ('error' in editor) return fail(editor.error)
  // Pencilled dates go, event-backed dates unlink, then archived_at is stamped (plans-store.ts).
  const res = await archiveSpacePlanRows(editor.spaceId, planId)
  if ('error' in res) return fail(res.error)
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
  // The Plan may have had no date until now, so anchored to-dos had nothing to resolve against.
  // Giving it one resolves them; a failure here is reported, never left to look like nothing.
  const anchored = await reanchorPlanTodos(slug, planId)
  if ('error' in anchored) return anchored
  revalidate(slug)
  return ok()
}

/**
 * Add one to-do to a Plan, either on a FIXED date or ANCHORED to the Plan's date.
 *
 * An anchored to-do stores the offset AND the due date it resolves to right now: the offset is the
 * truth that survives the date moving, the resolved `due_at` is what every existing reader (the
 * drawer list, the due-date calendar items, `isOverdue`) already knows how to show. Storing only the
 * offset is what made this column dead — nothing resolved it, so an anchored to-do looked undated
 * everywhere in the product.
 *
 * When the Plan has no live date yet the offset is still stored and `due_at` stays null. It fills in
 * the moment a date is penciled in, because `reanchorPlanTodos` resolves against the anchor rather
 * than against whatever was true at creation.
 */
export async function addPlanTodo(
  slug: string,
  planId: string,
  title: string,
  dueAt?: string | null,
  dueOffsetDays?: number | null,
): Promise<ActionResult<void>> {
  const editor = await editorPlan(slug, planId)
  if ('error' in editor) return fail(editor.error)
  const offset = normalizeOffsetDays(dueOffsetDays ?? null)
  let resolvedDueAt = dueAt ?? null
  if (offset !== null) {
    const anchorDay = await getPlanAnchorDayKey(editor.spaceId, planId)
    const day = anchorDay ? resolveDueFromOffset(anchorDay, offset) : null
    resolvedDueAt = day ? `${day}T12:00:00.000Z` : null
  }
  const created = await createTask(
    {
      createdBy: editor.profileId,
      title,
      dueAt: resolvedDueAt,
      planId,
      dueOffsetDays: offset,
    },
    editor.spaceId,
  )
  if (!created) return fail('That to-do could not be saved.')
  revalidate(slug)
  return ok()
}

/**
 * MOVE THE DATE, MOVE THE PREP LIST. The payoff of relative scheduling, and the only part of it that
 * delivers the value: every to-do anchored to this Plan is re-resolved against the Plan's current
 * date, and a to-do with a fixed date is left exactly where it is.
 *
 * Called from the drawer (an owner can ask for it) and, the case that matters, automatically by
 * `saveCalendarEntry` whenever a date that belongs to a Plan actually changes day. It re-READS the
 * anchor rather than trusting a day key from the caller, so the two entry points cannot disagree
 * and a stale browser cannot drag a checklist somewhere the calendar never went.
 *
 * FAIL-LOUD ON A SHORTFALL: if fewer rows move than were meant to, the caller is told. A checklist
 * half-moved is worse than one that did not move, and a swallowed one is an invisible regression.
 */
export async function reanchorPlanTodos(
  slug: string,
  planId: string,
): Promise<ActionResult<{ moved: number; anchorDay: string | null }>> {
  const editor = await editorPlan(slug, planId)
  if ('error' in editor) return fail(editor.error)
  const anchorDay = await getPlanAnchorDayKey(editor.spaceId, planId)
  if (!anchorDay) return ok({ moved: 0, anchorDay: null })
  const todos = await listTasks({ spaceId: editor.spaceId, planId, limit: 200 })
  const moves = moveAnchoredDues(
    todos.map((t) => ({ id: t.id, dueOffsetDays: t.dueOffsetDays, dueAt: t.dueAt })),
    anchorDay,
  )
  if (moves.length === 0) return ok({ moved: 0, anchorDay })
  const moved = await reanchorTaskDuesInScope(moves, { spaceId: editor.spaceId, planId })
  revalidate(slug)
  if (moved < moves.length) return fail('Some to-dos did not move with the date. Open the Plan and check them.')
  return ok({ moved, anchorDay })
}

export async function listPlanTodos(slug: string, planId?: string): Promise<CrmTask[]> {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  const all = await listTasks({ spaceId: editor.spaceId, planId: planId ?? null, limit: 200 })
  return all
}

/**
 * Tick a plan to-do off, or put it back. The other half of `addPlanTodo`: without it the readiness
 * bar in the drawer counts open to-dos that nothing this Space can reach could ever close, so the
 * checklist only ever grows. The status write is scoped to this Space AND this Plan, so an id from
 * elsewhere matches no row and reports a miss instead of moving a stranger's task.
 */
export async function setPlanTodoDone(
  slug: string,
  planId: string,
  todoId: string,
  done: boolean,
): Promise<ActionResult<void>> {
  const editor = await editorPlan(slug, planId)
  if ('error' in editor) return fail(editor.error)
  if (typeof todoId !== 'string' || !UUID_RE.test(todoId)) return fail('That to-do no longer exists.')
  const moved = await updateTaskStatusInScope(todoId, done ? 'done' : 'open', {
    spaceId: editor.spaceId,
    planId,
  })
  if (!moved) return fail('That to-do could not be updated.')
  revalidate(slug)
  return ok()
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
    spaceSlug: slug,
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
    spaceSlug: slug,
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
  // Through lib/calendar/admin-calendar.ts, the ONE file the publication gate lets opt out of
  // listEventsForSpace's published-only default (lib/events/space-events-gate.test.ts freezes that
  // list). Manager-gated by resolveEditor above, exactly like every other caller of that module.
  return listPlanLinkableEventRows(editor.spaceId)
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
    tasks: todos.map((t) => ({ title: t.title, dueOffsetDays: t.dueOffsetDays })),
  })
  const created = await saveSpacePlan(slug, null, { title: seed.title, notes: seed.notes, targetKind: plan.targetKind })
  if (isError(created)) return created
  for (const task of seed.tasks) {
    // The offset comes along; the resolved due date does not. The new Plan has no date yet, so the
    // copies resolve the moment one is penciled in and `reanchorPlanTodos` runs.
    await createTask(
      {
        createdBy: editor.profileId,
        title: task.title,
        planId: created.data.id,
        dueOffsetDays: task.dueOffsetDays,
      },
      editor.spaceId,
    )
  }
  revalidate(slug)
  return created
}

/**
 * ASK VERA (ADR-1386 P6, PROG-CAL6). Everything here is a proposal the drawer shows unpublished;
 * nothing is written. The two inputs that make the proposal honest are read HERE, from this Space
 * and no other, because the library (lib/calendar/vera-plan.ts) is pure and can only be as true as
 * what it is handed:
 *
 *   AVAILABILITY. The busy set is this Space's real calendar for the 90 days after the day
 *   suggestions start from (the Plan's own date when it is still ahead, else today): its private
 *   entries (Pencils, Unavailable time) and day notes on the caller's session, and its own events,
 *   drafts included, through the one module the publication gate lets read them. An empty set here
 *   used to be a literal, so Vera offered dates the team was already holding.
 *
 *   THE RECAP. For a Plan in production the attendance is read from the record of the events the
 *   Plan became (both halves of the link, `events.plan_id` and `published_event_id`), counted by
 *   lib/events/attendance.ts. Null means that record is empty, computed, not assumed. "Ran late" is
 *   gone from the recap: nothing in the data says when an event actually ended.
 */
export async function veraPlanProposal(slug: string, planId: string) {
  const editor = await resolveEditor(slug)
  if (!editor) return null
  const plan = await getSpacePlan(editor.spaceId, planId)
  if (!plan) return null
  const todos = await listTasks({ spaceId: editor.spaceId, planId, limit: 50 })
  const today = dayInZone(new Date())
  const anchorDay = await getPlanAnchorDayKey(editor.spaceId, plan.id)
  const fromDayKey = anchorDay && anchorDay > today ? anchorDay : today
  const window = availabilityWindow(fromDayKey)
  const [entries, events, dayNotes] = await Promise.all([
    listSpaceCalendarEntries(editor.spaceId, window.fromDay, window.toDay),
    listSpaceEventSpans(editor.spaceId),
    listDayNotes(editor.spaceId),
  ])
  const busyDayKeys = busyDayKeysFor({ entries, events, dayNotes, fromDay: window.fromDay, toDay: window.toDay })
  return buildVeraProposal({
    pastTaskTitles: todos.map((t) => t.title),
    busyDayKeys,
    preferredWeekdays: [0, 6],
    fromDayKey,
    gaps: readinessGaps({
      required: EVENT_MANIFEST.fields.filter((f) => f.required).map((f) => ({ path: f.path, label: f.label, value: plan.title })),
      openTodoCount: todos.filter((t) => t.status === 'open').length,
    }),
    recap: plan.stage === 'production' ? { title: plan.title, attendance: await planAttendance(editor.spaceId, plan.id) } : null,
  })
}

/** The count behind the recap: the union of both halves of the Plan-to-event link, then the record. */
async function planAttendance(spaceId: string, planId: string): Promise<number | null> {
  const [linked, published] = await Promise.all([
    listPlanEventIds(spaceId, planId),
    listPlanPublishedEventIds(spaceId, planId),
  ])
  const eventIds = [...new Set([...linked, ...published])]
  return eventIds.length ? loadPlanAttendance(eventIds) : null
}

export async function acceptVeraChecklist(slug: string, planId: string, titles: string[]): Promise<ActionResult<void>> {
  const editor = await editorPlan(slug, planId)
  if ('error' in editor) return fail(editor.error)
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
  const { error } = await db.from('space_plan_shares').insert({
    plan_id: planId,
    guest_space_id: guestSpaceId,
    status: 'accepted',
    requested_by: editor.profileId,
    responded_at: new Date().toISOString(),
    responded_by: editor.profileId,
  })
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
    .from('space_calendar_private_feeds')
    .update({ revoked_at: new Date().toISOString() })
    .eq('space_id', editor.spaceId)
    .is('revoked_at', null)
  const { error } = await db.from('space_calendar_private_feeds').insert({
    space_id: editor.spaceId,
    token,
    created_by: editor.profileId,
  })
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
