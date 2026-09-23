'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { parseVeraTranscript, proposeCalendarChanges, type VeraCalendarContext, type VeraTranscript } from '@/lib/ai/vera-calendar'
import {
  buildVeraDescribeContext,
  destructiveRefusal,
  fieldValueText,
  isDestructiveChange,
  isVeraMode,
  parseVeraChanges,
  parseVeraConfirmed,
  veraFieldList,
  veraFieldSpec,
  withVeraField,
  type VeraChange,
  type VeraClarificationOption,
  type VeraDescribeContext,
  type VeraSubject,
} from '@/lib/calendar/vera-command'
import { entryDaySpan, entryToInput, parseEntryInput, type EntryInput, type EntryRow, type EntryWrite } from '@/lib/calendar/entries'
import { getCalendarEntryRow, insertCalendarEntries, listSpaceCalendarEntries, updateCalendarEntryRow } from '@/lib/calendar/entries-store'
import { parsePlanInput, type PlanInput } from '@/lib/calendar/plans'
import { createPenciledPlanRows, getSpacePlan, listSpacePlans, transitionSpacePlanRows, updateSpacePlan } from '@/lib/calendar/plans-store'
import { planStageTransition } from '@/lib/calendar/workflow-board'
import { monthGridWindow, safeMonth } from '@/lib/calendar/month-window'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { dayInZone, resolveZone } from '@/lib/time/zone'
import { saveCalendarEntry } from './entry-actions'
import { addPlanTodo, archiveSpacePlan, reanchorPlanTodos, transitionPlanStage } from './plan-actions'

// VERA AT THE CALENDAR, the two doors (PROG-CAL10, ADR-1386 invariant 1).
//
// `veraCalendarCommand` READS: it builds this Space's context on the caller's session and returns
// the proposal, or a question when Vera needs one answered first (PROG-CAL11 slice 1). NOTHING ON
// THE CALENDAR IS WRITTEN HERE, whatever the model says. Two writes do happen behind this door and
// saying otherwise was a lie this comment used to tell: `proposeCalendarChanges` records the token
// spend as one `ai_usage` row through the service-role client (lib/ai/usage.ts), and the
// conversation a question opens is still NOT stored anywhere. The transcript rides in the box's
// state, comes back with the answer as untrusted input, and is shape- and size-checked before the
// model sees it again.
//
// `applyVeraChanges` WRITES, and only what the person ticked: the list comes back from the browser
// as untrusted input, is re-parsed through `parseVeraChanges`, and each change is then driven
// through the EXISTING calendar actions and stores on the caller's own session, so RLS stays the
// lock. One result per change: a partial failure is reported line by line and never swallowed.
//
// NO ADMIN CLIENT ON A NEW PATH, and one on an old one that is worth naming: the `todo` kind ends
// at `crm_tasks`, a service-role, staff-scoped table, through `addPlanTodo`. That path is
// authz-delegated, not open: `editorPlan` (plan-actions.ts) re-reads the Plan on the CALLER's
// session filtered by `space_id` before the stamped insert, so a Plan id from another Space is
// refused. Every other kind here writes on the caller's session only.
//
// THE SECOND GATE (owner ruling: Vera changes nothing without explicit permission). Accept alone
// was too coarse, so `isDestructiveChange` (archive, and a stage move to Cancelled) needs its own
// confirmation: the browser sends the positions it confirmed, and a destructive line whose position
// is not among them is REFUSED here, on its own result line. The client also arms that box, but the
// refusal is the server's, so a browser that skips it changes nothing. The proposal comes back with
// a `VeraDescribeContext` built from the rows this door already read, so every preview line can name
// its Plan and say what a field change would overwrite.
//
// A `field` change (PROG-CAL11 slice 2) is applied by reading the row, changing ONE attribute on
// the product's own form shape, and writing through the product's own parser and action
// (`parsePlanInput` + `updateSpacePlan` for a Plan, `saveCalendarEntry` for a date), so the
// validation that gates a by-hand edit gates Vera's too.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_MS = 86_400_000

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

export interface VeraCommandInput {
  ask: string
  /** pencil | plan | production: the stage new things start in. */
  mode: string
  /** The month the operator is looking at, so the context is what they can see. */
  year: number
  month1: number
  /** The browser zone, as the staff drawer already sends it. Resolved to a real IANA zone here. */
  timeZone?: string | null
  /** A continuation: the transcript the last clarification returned, exactly as it came. */
  transcript?: unknown
  /** A continuation: the chosen option's value, or the typed answer. */
  answer?: string | null
}

export type VeraCommandResult =
  | {
      kind: 'proposal'
      changes: VeraChange[]
      note: string
      timeZone: string
      /** Built here, from the rows this door read: the titles every line names, and what a `field`
       *  line would overwrite. The browser holds only the month it is showing, so a preview built
       *  from it could name neither. */
      context: VeraDescribeContext
    }
  | {
      kind: 'clarification'
      question: string
      options: VeraClarificationOption[]
      allowFreeText: boolean
      /** Send this back with the answer. Held in the box for the session; never stored. */
      transcript: VeraTranscript
      timeZone: string
    }

/** Ask Vera. Read only: the proposal, or her question, comes back for a person to answer. */
export async function veraCalendarCommand(slug: string, input: VeraCommandInput): Promise<ActionResult<VeraCommandResult>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!input || typeof input !== 'object') return fail('Say what should happen on the calendar.')
  let transcript: VeraTranscript | null = null
  if (input.transcript !== undefined && input.transcript !== null) {
    const parsed = parseVeraTranscript(input.transcript)
    if ('error' in parsed) return fail(parsed.error)
    transcript = parsed.transcript
    if (typeof input.answer !== 'string' || !input.answer.trim()) return fail('Pick one of the options, or type an answer.')
  }
  const mode = isVeraMode(input.mode) ? input.mode : 'pencil'
  const month = safeMonth(input.year, input.month1)
  const now = new Date()
  const timeZone = resolveZone(input.timeZone)
  const today = dayInZone(now, timeZone)
  const window = month ? monthGridWindow(month.year, month.month1) : monthGridWindow(now.getUTCFullYear(), now.getUTCMonth() + 1)
  const [plans, rows] = await Promise.all([listSpacePlans(editor.spaceId), listSpaceCalendarEntries(editor.spaceId, window.fromDay, window.toDay)])
  const context: VeraCalendarContext = {
    spaceId: editor.spaceId,
    timeZone,
    today,
    plans: plans.map((p) => ({ id: p.id, title: p.title, stage: p.stage })),
    entries: rows.map((r) => ({ id: r.id, title: r.title, day: entryDaySpan(r).dayKey, stage: r.stage, planId: r.plan_id })),
    profileId: editor.profileId,
  }
  const res = await proposeCalendarChanges({
    ask: typeof input.ask === 'string' ? input.ask : '',
    mode,
    context,
    transcript,
    answer: transcript ? input.answer : null,
  })
  if ('error' in res) return fail(res.error)
  if (res.kind === 'clarification') return ok({ ...res, timeZone })
  // Only the paths in the vocabulary are ever read off a subject (buildVeraDescribeContext), so
  // handing it the whole row cannot widen what reaches the browser.
  const planSubjects: Record<string, VeraSubject> = {}
  for (const p of plans) planSubjects[p.id] = { title: p.title, values: p as unknown as Record<string, unknown> }
  const entrySubjects: Record<string, VeraSubject> = {}
  for (const r of rows) entrySubjects[r.id] = { title: r.title, values: entryToInput(r) as unknown as Record<string, unknown> }
  return ok({ ...res, timeZone, context: buildVeraDescribeContext(res.changes, { plan: planSubjects, entry: entrySubjects }) })
}

export interface VeraApplyResult {
  /** The position of the change in the list that was sent. */
  index: number
  ok: boolean
  /** One plain sentence: what landed, or what did not and why. */
  message: string
}

type Editor = { spaceId: string; profileId: string }

function pencilInput(change: Extract<VeraChange, { kind: 'pencil' }>, day: string, entryStage: string, planId: string | null): EntryInput {
  return {
    kind: 'pencil',
    title: change.title,
    allDay: !change.startTime,
    startDate: day,
    endDate: day,
    startTime: change.startTime ?? null,
    endTime: change.endTime ?? null,
    timeZone: change.timeZone,
    stage: entryStage,
    blocksTime: false,
    showPublicly: false,
    planId,
  }
}

async function applyPencil(slug: string, editor: Editor, change: Extract<VeraChange, { kind: 'pencil' }>): Promise<VeraApplyResult['message'] | { error: string }> {
  const transition = planStageTransition(change.stage ?? 'pencil')
  if (!transition || transition.archived) return { error: 'That stage cannot start a Plan.' }
  const parsedPlan = parsePlanInput({ title: change.title, stage: 'pencil', targetKind: 'event' })
  if ('error' in parsedPlan) return { error: parsedPlan.error }

  let planId = change.planId ?? null
  let landed = 0
  let rest = change.days
  if (planId) {
    const plan = await getSpacePlan(editor.spaceId, planId)
    if (!plan) return { error: 'That Plan no longer exists.' }
  } else {
    // The first date and the Plan land together through the one RPC the by-hand path uses; the RPC
    // starts them at Pencil, and the whole Plan is moved once every date is on it.
    const first = parseEntryInput(pencilInput(change, change.days[0], 'pencil', null))
    if ('error' in first) return { error: first.error }
    const created = await createPenciledPlanRows(editor.spaceId, parsedPlan.data.title, first.data)
    if ('error' in created) return { error: created.error }
    planId = created.data.planId
    landed = 1
    rest = change.days.slice(1)
  }
  // One row per insert on purpose: several rows in one insert share an option_group and would
  // read as CANDIDATE dates of one Pencil. These are many dates of one Plan (owner ruling 1).
  const entryStage = change.planId ? transition.entryStage : 'pencil'
  for (const day of rest) {
    const parsed = parseEntryInput(pencilInput(change, day, entryStage, planId))
    if ('error' in parsed) break
    const res = await insertCalendarEntries(editor.spaceId, [parsed.data], editor.profileId)
    if ('error' in res) break
    landed += 1
  }
  const total = change.days.length
  if (landed < total) {
    return { error: `${landed} of ${total} dates landed for "${change.title}". The rest did not save. Open the Plan and check it.` }
  }
  if (!change.planId && transition.stage !== 'pencil') {
    const moved = await transitionSpacePlanRows(editor.spaceId, planId!, transition.stage)
    if ('error' in moved) return { error: `"${change.title}" is penciled on ${total} date${total === 1 ? '' : 's'}, but it could not be set to ${transition.label}. Set the stage on the Plan.` }
  }
  const anchored = await reanchorPlanTodos(slug, planId!)
  if ('error' in anchored) return { error: anchored.error }
  return change.planId
    ? `Added ${total} date${total === 1 ? '' : 's'} of "${change.title}" to the Plan.`
    : `Penciled "${change.title}" on ${total} date${total === 1 ? '' : 's'} as a new Plan at ${transition.label}.`
}

function shiftedWrite(row: EntryRow, toDay: string): EntryWrite | null {
  const { dayKey } = entryDaySpan(row)
  const from = Date.parse(`${dayKey}T00:00:00Z`)
  const to = Date.parse(`${toDay}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  const delta = Math.round((to - from) / DAY_MS) * DAY_MS
  const { id: _id, space_id: _space, option_group: _group, published_event_id: _published, ...rest } = row
  return {
    ...rest,
    starts_at: new Date(Date.parse(row.starts_at) + delta).toISOString(),
    ends_at: new Date(Date.parse(row.ends_at) + delta).toISOString(),
  }
}

async function applyMove(slug: string, editor: Editor, change: Extract<VeraChange, { kind: 'move' }>): Promise<string | { error: string }> {
  const row = await getCalendarEntryRow(editor.spaceId, change.entryId)
  if (!row) return { error: 'That date no longer exists.' }
  if (row.published_event_id) return { error: `"${row.title}" is already a published event. Move it in the event Studio.` }
  const write = shiftedWrite(row, change.toDay)
  if (!write) return { error: 'That day could not be read.' }
  const res = await updateCalendarEntryRow(editor.spaceId, change.entryId, write)
  if ('error' in res) return { error: res.error }
  if (row.plan_id) {
    const anchored = await reanchorPlanTodos(slug, row.plan_id)
    if ('error' in anchored) return { error: `"${row.title}" moved to ${shortDateLabel(change.toDay)}, but its to-dos did not follow. Open the Plan and check them.` }
  }
  return `Moved "${row.title}" to ${shortDateLabel(change.toDay)}.`
}

/**
 * ONE ATTRIBUTE OF ONE PLAN (PROG-CAL11 slice 2). The current row is read first and the whole
 * PlanInput is rebuilt from it with ONE attribute changed, then written through `parsePlanInput`
 * exactly as the drawer's save does, so the product's own validation (title length, the link cap,
 * the url shape) is the gate and nothing here re-states a rule. `stage` never comes through here:
 * the `stage` kind owns it, because a Plan's stage moves every linked date and a column write would
 * not. A `links` value is one row to ADD; a row the parser drops (no usable url) is reported, not
 * swallowed, because an accepted line that changed nothing is the invisible kind of failure.
 */
async function applyPlanField(editor: Editor, change: Extract<VeraChange, { kind: 'field' }>): Promise<string | { error: string }> {
  const plan = await getSpacePlan(editor.spaceId, change.id)
  if (!plan) return { error: 'That Plan no longer exists.' }
  const spec = veraFieldSpec('plan', change.path)
  if (!spec) return { error: `${change.path} is not a field Vera can set on a Plan.` }
  const input: PlanInput = {
    title: plan.title,
    notes: plan.notes,
    links: plan.links,
    stage: plan.stage,
    targetKind: plan.targetKind,
    playbookId: plan.playbookId,
  }
  const next = withVeraField(input, spec, spec.row ? [...veraFieldList(input, spec), change.value] : change.value)
  if (!next) return { error: `${spec.label} is not a field Vera can set on a Plan.` }
  const parsed = parsePlanInput(next)
  if ('error' in parsed) return { error: parsed.error }
  if (spec.row && parsed.data.links.length <= plan.links.length) {
    return { error: `That link was not kept on "${plan.title}". It needs a full web address starting with http, and a Plan holds 20 links at most.` }
  }
  const { stage: _stage, ...details } = parsed.data
  const res = await updateSpacePlan(editor.spaceId, change.id, details)
  if ('error' in res) return { error: res.error }
  if (spec.row) return `Added to ${spec.label} on "${plan.title}": ${fieldValueText(spec, change.value)}.`
  if (change.value === null) return `Cleared ${spec.label} on "${plan.title}".`
  return `Set ${spec.label} on "${plan.title}" to ${fieldValueText(spec, change.value)}.`
}

/**
 * ONE ATTRIBUTE OF ONE DATE. The row is read, turned into the drawer's own form (`entryToInput`),
 * one attribute is changed, and the form goes through `saveCalendarEntry`, the same action the
 * drawer's Save calls, so candidate-date rules, the Plan stage follow-through and the to-do
 * re-anchor all apply as they would by hand. A date that already became a published event is
 * refused here as it is on `move`: its record lives in the event Studio now.
 */
async function applyEntryField(slug: string, editor: Editor, change: Extract<VeraChange, { kind: 'field' }>): Promise<string | { error: string }> {
  const row = await getCalendarEntryRow(editor.spaceId, change.id)
  if (!row) return { error: 'That date no longer exists.' }
  if (row.published_event_id) return { error: `"${row.title}" is already a published event. Change it in the event Studio.` }
  const spec = veraFieldSpec('entry', change.path)
  if (!spec || spec.row) return { error: `${change.path} is not a field Vera can set on a date.` }
  const input = withVeraField(entryToInput(row), spec, change.value)
  if (!input) return { error: `${spec.label} is not a field Vera can set on a date.` }
  const res = await saveCalendarEntry(slug, change.id, input)
  if ('error' in res) return { error: res.error }
  if (change.value === null) return `Cleared ${spec.label} on "${row.title}".`
  return `Set ${spec.label} on "${row.title}" to ${fieldValueText(spec, change.value)}.`
}

async function applyOne(slug: string, editor: Editor, change: VeraChange): Promise<string | { error: string }> {
  switch (change.kind) {
    case 'pencil':
      return applyPencil(slug, editor, change)
    case 'move':
      return applyMove(slug, editor, change)
    case 'field':
      return change.target === 'plan' ? applyPlanField(editor, change) : applyEntryField(slug, editor, change)
    case 'stage': {
      const plan = await getSpacePlan(editor.spaceId, change.planId)
      if (!plan) return { error: 'That Plan no longer exists.' }
      const res = await transitionPlanStage(slug, change.planId, change.stage)
      if ('error' in res) return { error: res.error }
      const label = planStageTransition(change.stage)?.label ?? change.stage
      return change.stage === 'cancelled' ? `Marked "${plan.title}" Cancelled.` : `Set "${plan.title}" to ${label}.`
    }
    case 'retitle': {
      const plan = await getSpacePlan(editor.spaceId, change.planId)
      if (!plan) return { error: 'That Plan no longer exists.' }
      const parsed = parsePlanInput({ title: change.title })
      if ('error' in parsed) return { error: parsed.error }
      const res = await updateSpacePlan(editor.spaceId, change.planId, { title: parsed.data.title })
      if ('error' in res) return { error: res.error }
      return `Renamed "${plan.title}" to "${parsed.data.title}".`
    }
    case 'todo': {
      const plan = await getSpacePlan(editor.spaceId, change.planId)
      if (!plan) return { error: 'That Plan no longer exists.' }
      const res = await addPlanTodo(slug, change.planId, change.title, null, change.dueOffsetDays ?? null)
      if ('error' in res) return { error: res.error }
      return `Added the to-do "${change.title}" to "${plan.title}".`
    }
    case 'archive': {
      const plan = await getSpacePlan(editor.spaceId, change.planId)
      if (!plan) return { error: 'That Plan no longer exists.' }
      // THE SAME DOOR THE DRAWER'S "ARCHIVE PLAN" USES (LIVE-467). A bare archived_at stamp left the
      // Plan's pencilled dates on the grid, tied to a Plan no list showed and whose "Open Plan" did
      // nothing. archiveSpacePlan drops those dates, unlinks the ones that became events, then stamps.
      const res = await archiveSpacePlan(slug, change.planId)
      if ('error' in res) return { error: res.error }
      return `Archived "${plan.title}". Its penciled dates left the calendar; a date that became an event kept the event.`
    }
  }
}

/**
 * Apply the changes a person ticked. `raw` is whatever the browser sent, so it is parsed again
 * here with the same strict parser the proposal went through; a list that does not parse applies
 * nothing. `rawConfirmed` is the positions in that same list whose destructive confirmation came
 * back with them; a destructive line without its position is refused on its own line and nothing
 * else on the list is disturbed. Each change reports on its own line, and the calendar is revalidated once at the end
 * so the fresh tree comes back in this action's own round trip (no client refresh needed).
 */
export async function applyVeraChanges(
  slug: string,
  raw: unknown,
  rawConfirmed?: unknown,
): Promise<ActionResult<{ results: VeraApplyResult[] }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const parsed = parseVeraChanges(raw)
  if ('error' in parsed) return fail(parsed.error)
  const confirmed = parseVeraConfirmed(rawConfirmed, parsed.changes.length)
  const results: VeraApplyResult[] = []
  for (let i = 0; i < parsed.changes.length; i++) {
    const change = parsed.changes[i]
    // Every id was shape-checked by the parser; ownership is checked again by each store read on
    // the caller's session (getSpacePlan / getCalendarEntryRow filter by this Space, then RLS).
    if ('planId' in change && change.planId && !UUID_RE.test(change.planId)) {
      results.push({ index: i, ok: false, message: 'That Plan could not be found.' })
      continue
    }
    // The second gate. A ticked destructive line is still not enough: without the confirmation that
    // named what it deletes, nothing on it runs.
    if (isDestructiveChange(change) && !confirmed.has(i)) {
      results.push({ index: i, ok: false, message: destructiveRefusal(change) })
      continue
    }
    try {
      const outcome = await applyOne(slug, editor, change)
      if (typeof outcome === 'string') results.push({ index: i, ok: true, message: outcome })
      else results.push({ index: i, ok: false, message: outcome.error })
    } catch {
      results.push({ index: i, ok: false, message: 'That change did not save. Nothing else was touched by it.' })
    }
  }
  if (results.some((r) => r.ok)) revalidate(slug)
  return ok({ results })
}
