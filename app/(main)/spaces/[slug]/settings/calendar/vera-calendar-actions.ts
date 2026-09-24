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
  irreversibleReason,
  isDestructiveChange,
  isVeraMode,
  parseVeraChanges,
  parseVeraConfirmed,
  reverseChange,
  undoChanges,
  undoNote,
  veraBeforeFieldValue,
  veraFieldList,
  veraFieldSpec,
  withVeraField,
  workingStage,
  type VeraBefore,
  type VeraChange,
  type VeraClarificationOption,
  type VeraDescribeContext,
  type VeraLogStep,
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
import { getVeraChangeRecord, listVeraChangeRecords, recordVeraChanges } from '@/lib/calendar/vera-log-store'
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
//
// THE RECORD, AND UNDO (PROG-CAL11 slice 3; the other half of the 2026-09-22 owner ask). Every
// accepted proposal writes ONE row to the change log: each change that landed, the sentence it
// reported, and the change that puts it back. The before values are captured HERE because this door
// is the only place that knows them, which is why every apply helper now returns an `Applied`
// rather than a string: it read the row a moment before it wrote, and by the time the record is
// written the old value is gone. `undoVeraChanges` reads a record and hands those reverses back,
// LAST FIRST, as an ordinary proposal. Undo therefore writes nothing by itself: it goes through
// Accept, through the destructive confirmation where one applies, and through these same actions,
// and accepting it writes its own record pointing at the one it reversed. Nothing leaves the log,
// and that is the database's rule rather than this file's: the table has no update or delete
// policy, so an append is the only thing any caller here can do to it.

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
      /** Set when this proposal is an Undo: the record it reverses, sent back on Accept so the new
       *  record points at it and the log reads forwards. */
      undoOf?: string
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

/**
 * WHAT ONE CHANGE LANDED, AND WHAT IT LOOKED LIKE FIRST (PROG-CAL11 slice 3).
 *
 * `before` is the reason every apply helper below now reads the row and hands something back: this
 * door is the only place that knows what the calendar held a moment ago, and by the time the record
 * is written the old value is gone. `reverseChange` turns it into a change in the same closed
 * vocabulary; a null `before` is a change this vocabulary cannot reverse, and the record then keeps
 * `irreversibleReason` in its place rather than a hole.
 */
type Applied = { message: string; before: VeraBefore | null }

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

async function applyPencil(slug: string, editor: Editor, change: Extract<VeraChange, { kind: 'pencil' }>): Promise<Applied | { error: string }> {
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
  // A pencil that STARTED a Plan is reversed by taking that Plan back; dates added to a Plan that
  // was already there are not, because there is no verb here for removing one date from a Plan.
  return change.planId
    ? { message: `Added ${total} date${total === 1 ? '' : 's'} of "${change.title}" to the Plan.`, before: null }
    : {
        message: `Penciled "${change.title}" on ${total} date${total === 1 ? '' : 's'} as a new Plan at ${transition.label}.`,
        before: { kind: 'pencil', createdPlanId: planId! },
      }
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

async function applyMove(slug: string, editor: Editor, change: Extract<VeraChange, { kind: 'move' }>): Promise<Applied | { error: string }> {
  const row = await getCalendarEntryRow(editor.spaceId, change.entryId)
  if (!row) return { error: 'That date no longer exists.' }
  if (row.published_event_id) return { error: `"${row.title}" is already a published event. Move it in the event Studio.` }
  // Read before the write, or there is nothing to move back to.
  const fromDay = entryDaySpan(row).dayKey
  const write = shiftedWrite(row, change.toDay)
  if (!write) return { error: 'That day could not be read.' }
  const res = await updateCalendarEntryRow(editor.spaceId, change.entryId, write)
  if ('error' in res) return { error: res.error }
  if (row.plan_id) {
    const anchored = await reanchorPlanTodos(slug, row.plan_id)
    if ('error' in anchored) return { error: `"${row.title}" moved to ${shortDateLabel(change.toDay)}, but its to-dos did not follow. Open the Plan and check them.` }
  }
  return { message: `Moved "${row.title}" to ${shortDateLabel(change.toDay)}.`, before: { kind: 'move', day: fromDay } }
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
async function applyPlanField(editor: Editor, change: Extract<VeraChange, { kind: 'field' }>): Promise<Applied | { error: string }> {
  const plan = await getSpacePlan(editor.spaceId, change.id)
  if (!plan) return { error: 'That Plan no longer exists.' }
  const spec = veraFieldSpec('plan', change.path)
  if (!spec) return { error: `${change.path} is not a field Vera can set on a Plan.` }
  // 🔴 EVERY WRITTEN COLUMN IS CARRIED, because the whole input is rebuilt and the whole parsed
  // output is written: a column left out of this literal is a column BLANKED the next time Vera
  // edits any other field. `files` is here for that reason and no other (PROG-CAL14): Vera cannot
  // name it, and she would still have wiped a team's attached images by setting a note.
  const input: PlanInput = {
    title: plan.title,
    notes: plan.notes,
    links: plan.links,
    files: plan.files,
    stage: plan.stage,
    targetKind: plan.targetKind,
    playbookId: plan.playbookId,
  }
  // The value the field holds now, checked by the same kernel call the forward value went through.
  // Null for a repeat (a row is added, not replaced) and for anything the field's own rules refuse.
  const held = veraBeforeFieldValue(spec, (input as unknown as Record<string, unknown>)[spec.path])
  const before: VeraBefore | null = spec.row ? null : { kind: 'field', value: held }
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
  if (spec.row) return { message: `Added to ${spec.label} on "${plan.title}": ${fieldValueText(spec, change.value)}.`, before }
  if (change.value === null) return { message: `Cleared ${spec.label} on "${plan.title}".`, before }
  return { message: `Set ${spec.label} on "${plan.title}" to ${fieldValueText(spec, change.value)}.`, before }
}

/**
 * ONE ATTRIBUTE OF ONE DATE. The row is read, turned into the drawer's own form (`entryToInput`),
 * one attribute is changed, and the form goes through `saveCalendarEntry`, the same action the
 * drawer's Save calls, so candidate-date rules, the Plan stage follow-through and the to-do
 * re-anchor all apply as they would by hand. A date that already became a published event is
 * refused here as it is on `move`: its record lives in the event Studio now.
 */
async function applyEntryField(slug: string, editor: Editor, change: Extract<VeraChange, { kind: 'field' }>): Promise<Applied | { error: string }> {
  const row = await getCalendarEntryRow(editor.spaceId, change.id)
  if (!row) return { error: 'That date no longer exists.' }
  if (row.published_event_id) return { error: `"${row.title}" is already a published event. Change it in the event Studio.` }
  const spec = veraFieldSpec('entry', change.path)
  if (!spec || spec.row) return { error: `${change.path} is not a field Vera can set on a date.` }
  const current = entryToInput(row)
  const before: VeraBefore = { kind: 'field', value: veraBeforeFieldValue(spec, (current as unknown as Record<string, unknown>)[spec.path]) }
  const input = withVeraField(current, spec, change.value)
  if (!input) return { error: `${spec.label} is not a field Vera can set on a date.` }
  const res = await saveCalendarEntry(slug, change.id, input)
  if ('error' in res) return { error: res.error }
  if (change.value === null) return { message: `Cleared ${spec.label} on "${row.title}".`, before }
  return { message: `Set ${spec.label} on "${row.title}" to ${fieldValueText(spec, change.value)}.`, before }
}

async function applyOne(slug: string, editor: Editor, change: VeraChange): Promise<Applied | { error: string }> {
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
      // The working stage the row is in now. A cancelled Plan's row reads `plan`, so reversing a
      // cancel puts the Plan back at a working stage and never at Cancelled again.
      const was = workingStage(plan.stage)
      const res = await transitionPlanStage(slug, change.planId, change.stage)
      if ('error' in res) return { error: res.error }
      const label = planStageTransition(change.stage)?.label ?? change.stage
      const message = change.stage === 'cancelled' ? `Marked "${plan.title}" Cancelled.` : `Set "${plan.title}" to ${label}.`
      return { message, before: was ? { kind: 'stage', stage: was } : null }
    }
    case 'retitle': {
      const plan = await getSpacePlan(editor.spaceId, change.planId)
      if (!plan) return { error: 'That Plan no longer exists.' }
      const parsed = parsePlanInput({ title: change.title })
      if ('error' in parsed) return { error: parsed.error }
      const res = await updateSpacePlan(editor.spaceId, change.planId, { title: parsed.data.title })
      if ('error' in res) return { error: res.error }
      return { message: `Renamed "${plan.title}" to "${parsed.data.title}".`, before: { kind: 'retitle', title: plan.title } }
    }
    case 'todo': {
      const plan = await getSpacePlan(editor.spaceId, change.planId)
      if (!plan) return { error: 'That Plan no longer exists.' }
      const res = await addPlanTodo(slug, change.planId, change.title, null, change.dueOffsetDays ?? null)
      if ('error' in res) return { error: res.error }
      return { message: `Added the to-do "${change.title}" to "${plan.title}".`, before: null }
    }
    case 'archive': {
      const plan = await getSpacePlan(editor.spaceId, change.planId)
      if (!plan) return { error: 'That Plan no longer exists.' }
      // THE SAME DOOR THE DRAWER'S "ARCHIVE PLAN" USES (LIVE-467). A bare archived_at stamp left the
      // Plan's pencilled dates on the grid, tied to a Plan no list showed and whose "Open Plan" did
      // nothing. archiveSpacePlan drops those dates, unlinks the ones that became events, then stamps.
      const res = await archiveSpacePlan(slug, change.planId)
      if ('error' in res) return { error: res.error }
      return { message: `Archived "${plan.title}". Its penciled dates left the calendar; a date that became an event kept the event.`, before: null }
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
 *
 * `rawUndoOf` is set when this list is an Undo: the record it reverses, checked against this Space
 * BEFORE anything runs, because a link that cannot be resolved would otherwise be dropped quietly
 * on the way into the record. Whatever lands is written to the change log as one record, so the
 * batch can be read back and reversed later, and an Undo's record points at the batch it undid.
 */
export async function applyVeraChanges(
  slug: string,
  raw: unknown,
  rawConfirmed?: unknown,
  rawUndoOf?: unknown,
): Promise<ActionResult<{ results: VeraApplyResult[]; logError?: string }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const parsed = parseVeraChanges(raw)
  if ('error' in parsed) return fail(parsed.error)
  const confirmed = parseVeraConfirmed(rawConfirmed, parsed.changes.length)
  // An Undo names the record it reverses. It is checked BEFORE anything is applied: a link that
  // cannot be resolved would otherwise be dropped on the way into the record, and a log that
  // quietly loses half a pair is a log nobody can read backwards.
  let undoOf: string | null = null
  if (rawUndoOf !== undefined && rawUndoOf !== null && rawUndoOf !== '') {
    if (typeof rawUndoOf !== 'string' || !UUID_RE.test(rawUndoOf)) return fail('That undo names a batch that is not one of ours. Nothing was changed.')
    const prior = await getVeraChangeRecord(editor.spaceId, rawUndoOf)
    if (!prior) return fail('That batch is not in this calendar\'s change log. Nothing was changed.')
    undoOf = prior.id
  }
  const results: VeraApplyResult[] = []
  const steps: VeraLogStep[] = []
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
      if ('error' in outcome) {
        results.push({ index: i, ok: false, message: outcome.error })
        continue
      }
      results.push({ index: i, ok: true, message: outcome.message })
      // The record is written from what the ACTION saw, never from what the browser sent: the
      // sentence it reported, and the change that puts it back, built from the value it read first.
      const reverse = reverseChange(change, outcome.before)
      steps.push({ change, message: outcome.message, reverse, reason: reverse ? null : irreversibleReason(change) })
    } catch {
      results.push({ index: i, ok: false, message: 'That change did not save. Nothing else was touched by it.' })
    }
  }
  if (steps.length === 0) return ok({ results })
  revalidate(slug)
  // The record is written AFTER the changes land, so it only ever claims what actually happened.
  // A record that fails to write does not fail the batch, and it does not go quiet either: the
  // store logs it and the box says Undo will not offer this batch.
  const recorded = await recordVeraChanges(editor.spaceId, editor.profileId, steps, undoOf)
  return ok({ results, logError: 'error' in recorded ? recorded.error : undefined })
}

/**
 * UNDO (PROG-CAL11 slice 3). Reads one record and hands back the changes that put it back, LAST
 * FIRST, as an ordinary proposal. NOTHING IS WRITTEN HERE: an Undo goes through Accept, through
 * the destructive confirmation where one applies, and through the same actions the forward changes
 * went through, which is why it is a proposal and not a button that acts. Accepting it writes its
 * own record pointing back at this one, so the log keeps both halves and nothing is ever deleted.
 */
export async function undoVeraChanges(slug: string, rawRecordId: unknown): Promise<ActionResult<VeraCommandResult>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (typeof rawRecordId !== 'string' || !UUID_RE.test(rawRecordId)) return fail('That undo names a batch that is not one of ours.')
  const record = await getVeraChangeRecord(editor.spaceId, rawRecordId)
  if (!record) return fail('That batch is not in this calendar\'s change log.')
  const changes = undoChanges(record.steps)
  if (changes.length === 0) return fail('Nothing in that batch can be put back from here. Each line in the log says why.')
  // The subjects are read by ID rather than off a month window: a Plan an Undo would un-cancel is
  // archived right now and would be missing from the working list, and its line would read
  // "that Plan" at the exact moment a person most needs to know which one.
  const planIds = [...new Set(changes.flatMap((c) => ('planId' in c && c.planId ? [c.planId] : c.kind === 'field' && c.target === 'plan' ? [c.id] : [])))]
  const entryIds = [...new Set(changes.flatMap((c) => (c.kind === 'move' ? [c.entryId] : c.kind === 'field' && c.target === 'entry' ? [c.id] : [])))]
  const [plans, rows] = await Promise.all([
    Promise.all(planIds.map((id) => getSpacePlan(editor.spaceId, id))),
    Promise.all(entryIds.map((id) => getCalendarEntryRow(editor.spaceId, id))),
  ])
  const planSubjects: Record<string, VeraSubject> = {}
  for (const plan of plans) if (plan) planSubjects[plan.id] = { title: plan.title, values: plan as unknown as Record<string, unknown> }
  const entrySubjects: Record<string, VeraSubject> = {}
  for (const row of rows) if (row) entrySubjects[row.id] = { title: row.title, values: entryToInput(row) as unknown as Record<string, unknown> }
  return ok({
    kind: 'proposal',
    changes,
    note: undoNote(record.steps),
    timeZone: resolveZone(null),
    context: buildVeraDescribeContext(changes, { plan: planSubjects, entry: entrySubjects }),
    undoOf: record.id,
  })
}

/** One accepted batch as the console lists it. The closed vocabulary stays on this side: the
 *  browser gets the sentences the actions wrote and the count Undo can put back, nothing more. */
export interface VeraLogEntry {
  id: string
  /** When it was accepted, ISO. */
  at: string
  lines: { message: string; reason: string | null }[]
  /** How many of those lines Undo can put back. Zero means the Undo control is not offered. */
  reversible: number
  /** The batch this one reversed, when it was an Undo. */
  undoOf: string | null
  /** The later batch that reversed this one, when there is one. */
  undoneBy: string | null
}

/** The Space's recent Vera batches, newest first. Read only. */
export async function listVeraChangeLog(slug: string): Promise<ActionResult<{ entries: VeraLogEntry[] }>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  const records = await listVeraChangeRecords(editor.spaceId)
  return ok({
    entries: records.map((record) => ({
      id: record.id,
      at: record.at,
      lines: record.steps.map((step) => ({ message: step.message, reason: step.reason })),
      reversible: undoChanges(record.steps).length,
      undoOf: record.undoOf,
      undoneBy: record.undoneBy,
    })),
  })
}
