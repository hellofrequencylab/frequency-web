// VERA AT THE CALENDAR, the vocabulary (PROG-CAL10). Pure: no React, no Supabase, no model.
//
// The owner asked for a box where a person tells Vera, in plain words, what to do to the calendar
// ("pencil a sound bath on every new moon this winter") and Vera works it out. ADR-1386 invariant 1
// says Vera never publishes, sends or books on her own, so what she produces is not an edit: it is a
// LIST OF PROPOSED CHANGES in the closed vocabulary below, shown line by line, and nothing touches a
// row until a person ticks the lines and presses Accept. Then `applyVeraChanges` re-parses the list
// through `parseVeraChanges` (never trusting the browser) and drives each change through the
// EXISTING calendar actions and stores on the caller's own session.
//
// Kinds map one to one onto things the calendar can already do by hand:
//   pencil    one Plan, one or many dates (owner ruling 1: a Plan holds many dates)
//   move      one existing date to another day, its anchored to-dos following it
//   stage     a Plan (and every linked date) to Pencil, Planning, Production or Cancelled
//   retitle   a Plan's title
//   todo      a to-do on a Plan, fixed or anchored N days before the Plan's date
//   archive   a Plan out of the working set
//   field     ONE attribute of one existing Plan or date, named by its manifest path
// A change that cannot be expressed here cannot be proposed, which is the point.
//
// TWO GATES, NOT ONE (owner ruling: "I don't want Vera changing things without explicit
// permission"). Accept was the whole gate, and every line arrived ticked, so the default action was
// apply-all and an archive sat in the same list as a retitle. Now:
//   1. A DESTRUCTIVE change (`isDestructiveChange`) arrives UNTICKED and ticking it is not enough.
//      It carries its own confirmation (`destructiveConfirmation`), whose visible words name the
//      consequence, and `applyVeraChanges` refuses the line when that confirmation did not come
//      back with it. The refusal is the server's, so a browser that skips the second box changes
//      nothing.
//   2. A `field` change that would overwrite something says so. The preview line carries what the
//      current value holds (`VeraDescribeContext.current`), so "Set Team notes to ..." reads as the
//      replacement it is instead of hiding 20,000 characters behind a full stop.
// Both need the SERVER's knowledge of the rows, which is why `VeraDescribeContext` is built by
// `buildVeraDescribeContext` on the propose door and returned with the proposal, rather than
// assembled from whatever the browser happens to be holding. That is also what stops a line
// reading "Archive that Plan.": the server knows every title it named.
//
// A CLARIFICATION (PROG-CAL11 slice 1) is the one other thing Vera may answer with: when the ask
// is ambiguous in a way that changes the outcome ("move the sound bath" and there are three), she
// returns one plain question with the candidates instead of guessing, the box shows it, and the
// answer joins the next turn. `parseVeraClarification` holds that shape to the same strictness as
// the changes: a question with two to five options, or nothing.
//
// THE VOCABULARY READS THE MANIFEST (PROG-CAL11 slice 2). A `field` change names a path and a
// value, and the paths Vera may name are not written here: for a Plan they are the rail-writable
// fields of SPACE_PLAN_MANIFEST (`railForm`, minus `stage`, which has its own kind), and its `links`
// repeat takes one row. A value is checked against the field's own kind and options by the kernel
// (`checkFieldValue` / `checkRepeatRow`), never by a hand-written rule per field, so adding a field
// to the manifest is the whole change and Vera can set it the same day. The kernel stays entity-
// blind: this module imports the manifest and the kernel; the kernel never imports this.
//
// UNDO IS A PROPOSAL (PROG-CAL11 slice 3). Every accepted proposal is recorded, step by step, with
// the change that puts each step back: `reverseChange` builds that from the value the ACTION read
// off the row before it wrote, which is why the before values are captured there and not here. A
// step this vocabulary cannot reverse (a to-do has no delete verb, an archive deleted its dates)
// carries `irreversibleReason` instead of a reverse, so the log says what it cannot do rather than
// leaving a gap. Undo is then `undoChanges`: the reverses, in reverse order, handed back as an
// ordinary proposal that goes through the same two gates and lands through the same actions.
//
// There is no manifest for a calendar date yet (lib/studio/entities has none), so the date side is
// an explicit allowlist declared in the manifest's own field shape, derived from `EntryInput`
// (lib/calendar/entries.ts), and checked by the same kernel call. The day a date manifest lands,
// `ENTRY_FIELDS` becomes `railForm(...)` of it and nothing else here changes.

import { PLAN_STAGE_TRANSITIONS, type WorkflowStage } from './workflow-board'
import { PLAN_WRITES, type PlanStage } from './plans'
import { shortDateLabel } from './short-date'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import { railForm } from '@/lib/studio/kernel/edit-plan'
import { checkFieldValue, checkRepeatRow, type RepeatRowValue, type ScalarFieldValue } from '@/lib/studio/kernel/field-value'
import { repeatLabel, type FieldDef, type RepeatDef } from '@/lib/studio/kernel/manifest'

export type VeraMode = PlanStage

/** What a `field` change sets: one scalar, or one row of a repeat (a link to add). */
export type VeraFieldValue = ScalarFieldValue | RepeatRowValue

export type VeraFieldTarget = 'plan' | 'entry'

export type VeraChange =
  | {
      kind: 'pencil'
      title: string
      /** YYYY-MM-DD, in the Space's zone. One Plan, many dates. */
      days: string[]
      /** HH:MM. Both or neither; neither means all day. */
      startTime?: string
      endTime?: string
      timeZone: string
      /** An existing Plan to add the dates to; null starts a new Plan titled `title`. */
      planId?: string | null
      /** The stage the new Plan (and its dates) start in. Defaults to Pencil. */
      stage?: VeraMode
    }
  | { kind: 'move'; entryId: string; toDay: string }
  | { kind: 'stage'; planId: string; stage: WorkflowStage }
  | { kind: 'retitle'; planId: string; title: string }
  | { kind: 'todo'; planId: string; title: string; dueOffsetDays?: number | null }
  | { kind: 'archive'; planId: string }
  | {
      kind: 'field'
      target: VeraFieldTarget
      /** The Plan's or the date's id. */
      id: string
      /** A path from `veraFieldVocabulary()`: a manifest field, or a repeat whose value is one row. */
      path: string
      value: VeraFieldValue
    }

export type VeraChangeKind = VeraChange['kind']

export const VERA_CHANGE_KINDS: readonly VeraChangeKind[] = ['pencil', 'move', 'stage', 'retitle', 'todo', 'archive', 'field']

/**
 * THE CHANGES THAT NEED THEIR OWN PERMISSION.
 *
 * `archive` deletes rows: `archiveSpacePlanRows` drops every penciled date the Plan holds, unlinks
 * the ones that became events, then stamps the Plan. The Plan is restorable in SQL; the dates are
 * not restorable at all, and there is no restore control in the product. `stage: cancelled` takes
 * the Plan out of every list and board (the transition stamps `archived_at` too) and marks every
 * linked date Cancelled. Neither is something a person should be able to do by leaving a pre-ticked
 * box alone, so both arrive unticked and both need the confirmation below.
 */
export function isDestructiveChange(change: VeraChange): boolean {
  return change.kind === 'archive' || (change.kind === 'stage' && change.stage === 'cancelled')
}

/** The words of a destructive line's own confirmation. Both are visible: `label` beside the box and
 *  `detail` under it, inside the same `<label>`, so what a person reads is what a screen reader
 *  announces and no aria-label overrides a visible one. */
export interface VeraConfirmation {
  label: string
  detail: string
}

/** What the person must agree to before a destructive line can be applied, in plain words and
 *  naming the Plan. Null for everything that is not destructive. */
export function destructiveConfirmation(change: VeraChange, ctx: VeraDescribeContext): VeraConfirmation | null {
  if (change.kind === 'archive') {
    return {
      label: `Yes, archive ${quoted(ctx.plans[change.planId], 'that Plan')} and delete its penciled dates.`,
      detail:
        'Those dates are deleted, not hidden, and there is no restore control here. A date that already became an event keeps the event and loses its link to the Plan.',
    }
  }
  if (change.kind === 'stage' && change.stage === 'cancelled') {
    return {
      label: `Yes, mark ${quoted(ctx.plans[change.planId], 'that Plan')} Cancelled, every linked date included.`,
      detail:
        'The Plan leaves every list and board here, the same as archiving it, and there is no restore control. Its dates are not deleted: each one reads Cancelled.',
    }
  }
  return null
}

/** The line a destructive change gets back when its confirmation did not come with it. */
export function destructiveRefusal(change: VeraChange): string {
  return change.kind === 'archive'
    ? 'Nothing was archived. Tick the confirmation under that line, which says what archiving deletes, then accept again.'
    : 'Nothing was cancelled. Tick the confirmation under that line, which says what cancelling does, then accept again.'
}

/**
 * Which lines came back confirmed. The browser sends positions in the list it is applying, so
 * anything that is not a whole number inside that list is dropped: an unreadable confirmation is no
 * confirmation, and the line it belonged to is refused rather than applied.
 */
export function parseVeraConfirmed(raw: unknown, count: number): Set<number> {
  const out = new Set<number>()
  if (!Array.isArray(raw)) return out
  for (const value of raw) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count) out.add(value)
  }
  return out
}

/**
 * One path Vera may set, with what a person calls it and how the kernel checks it. `field` is a
 * manifest field (its value is one scalar); `row` is a manifest repeat (its value is one row to add).
 */
export type VeraFieldSpec =
  | { target: VeraFieldTarget; path: string; label: string; field: Omit<FieldDef, 'section'>; row?: undefined }
  | { target: VeraFieldTarget; path: string; label: string; row: RepeatDef; field?: undefined }

/**
 * The date side of the vocabulary, in the manifest's field shape, derived from `EntryInput`. Labels
 * are the drawer's (app/(main)/spaces/[slug]/settings/calendar/staff-calendar.tsx). Not here on
 * purpose: `kind`, `stage`, `status` and `planId` (each has its own change kind or its own seam),
 * `startDate` / `endDate` (`move` owns the day), `repeat` / `exceptionDates` / `candidateDates`
 * (a series is edited in the drawer). `showPublicly` is `EntryInput`'s name for the visibility;
 * `parseEntryInput` owns the mapping to the column and refuses it on a kind that cannot show.
 */
const ENTRY_FIELDS: readonly Omit<FieldDef, 'section'>[] = [
  { path: 'title', label: 'Title', kind: 'text', required: true },
  { path: 'location', label: 'Location', kind: 'text' },
  { path: 'description', label: 'Description', kind: 'longtext', prose: true },
  { path: 'notes', label: 'Team notes', kind: 'longtext' },
  { path: 'allDay', label: 'All day', kind: 'toggle' },
  { path: 'startTime', label: 'Start time', kind: 'text' },
  { path: 'endTime', label: 'End time', kind: 'text' },
  { path: 'showPublicly', label: 'Shown publicly', kind: 'toggle' },
]

/**
 * The paths a `field` change may name, per target, read from the manifest at call time so a field
 * added to SPACE_PLAN_MANIFEST (and written by `saveSpacePlan`) appears to Vera with no change here.
 * `stage` is left out because the `stage` kind moves every linked date with the Plan, which a bare
 * column write would not.
 */
export function veraFieldVocabulary(): Record<VeraFieldTarget, VeraFieldSpec[]> {
  const rail = railForm(SPACE_PLAN_MANIFEST, PLAN_WRITES)
  const plan: VeraFieldSpec[] = [
    ...rail.fields.filter((f) => f.path !== 'stage').map((f): VeraFieldSpec => ({ target: 'plan', path: f.path, label: f.label, field: f })),
    ...rail.repeats.map((r): VeraFieldSpec => ({ target: 'plan', path: r.arrayPath, label: repeatLabel(r), row: r })),
  ]
  const entry: VeraFieldSpec[] = ENTRY_FIELDS.map((f) => ({ target: 'entry', path: f.path, label: f.label, field: f }))
  return { plan, entry }
}

/** The spec for one path on one target, or null when Vera may not set it. */
export function veraFieldSpec(target: VeraFieldTarget, path: string): VeraFieldSpec | null {
  return veraFieldVocabulary()[target].find((s) => s.path === path) ?? null
}

/**
 * Keys that are never a field path, refused by name. `veraFieldSpec` above is the real allowlist
 * and nothing reaches a write by a path the manifest never declared. This is the second lock, and
 * it is here because a manifest is edited by people: the day one declares a path called
 * `constructor`, the failure should be a refusal rather than a mangled object.
 */
const UNSAFE_FIELD_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * One declared field set on a COPY of an entity's own form input.
 *
 * The key is `spec.path`, which this module built out of the manifest, never the raw string the
 * model sent: `veraFieldSpec` is what turns one into the other, and a path the vocabulary does not
 * declare has already been refused by the time a spec exists. The write is an object SPREAD rather
 * than an assignment through a computed index, so the result is always a fresh object carrying the
 * field as its own property, and the caller's input is never mutated underneath it.
 */
export function withVeraField<T extends object>(input: T, spec: VeraFieldSpec, value: unknown): T | null {
  if (UNSAFE_FIELD_KEYS.has(spec.path)) return null
  return { ...input, [spec.path]: value } as T
}

/** What a repeat field holds now, read by its declared path. */
export function veraFieldList<T extends object>(input: T, spec: VeraFieldSpec): unknown[] {
  const held = (input as Record<string, unknown>)[spec.path]
  return Array.isArray(held) ? held : []
}

/** The noun a target is called in a sentence a person reads. */
function veraTargetNoun(target: VeraFieldTarget): string {
  return target === 'plan' ? 'Plan' : 'date'
}

/**
 * A field value as a person reads it on a proposal line: an option by its label, a toggle as on or
 * off, a row by its filled fields, text in quotes, and a cleared value as the word.
 */
export function fieldValueText(spec: VeraFieldSpec, value: VeraFieldValue): string {
  if (value === null) return 'nothing'
  if (typeof value === 'object') {
    const parts = (spec.row?.fields ?? []).map((f) => value[f.path]).filter((v): v is string | number | boolean => v !== null && v !== undefined)
    return parts.map((v) => (typeof v === 'string' ? `"${v}"` : String(v))).join(', ')
  }
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') return String(value)
  const option = spec.field?.options?.find((o) => o.value === value)
  return option ? option.label : `"${value}"`
}

/** The most changes one proposal may carry. A bigger ask is two asks. */
export const MAX_VERA_CHANGES = 40

/** The most dates one pencil change may carry (a year of new moons is 13; a weekly season is 26). */
export const MAX_PENCIL_DAYS = 60
const MAX_TITLE = 200
const MAX_OFFSET_DAYS = 365

/**
 * A question Vera asks before proposing, when guessing would change the outcome. The options are
 * drawn from the context (a Plan, a date, a time), `value` is what comes back as the answer (an id
 * where one exists, so the model matches it exactly), and `allowFreeText` lets the person type an
 * answer none of the options cover.
 */
export interface VeraClarificationOption {
  label: string
  value: string
}

export interface VeraClarification {
  question: string
  options: VeraClarificationOption[]
  allowFreeText: boolean
}

/** The fewest and the most options one clarification may offer. One option is not a question. */
export const MIN_CLARIFICATION_OPTIONS = 2
export const MAX_CLARIFICATION_OPTIONS = 5
const MAX_CLARIFICATION_QUESTION = 200
const MAX_CLARIFICATION_LABEL = 60
const MAX_CLARIFICATION_VALUE = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export const VERA_STAGES: readonly WorkflowStage[] = PLAN_STAGE_TRANSITIONS.map((t) => t.stage)
/** The modes the box offers: the three working stages, in order, with their canon labels. */
export const VERA_MODE_OPTIONS: readonly { value: VeraMode; label: string }[] = PLAN_STAGE_TRANSITIONS.filter(
  (t) => !t.archived,
).map((t) => ({ value: t.planStage, label: t.label }))

export function stageLabel(stage: string): string {
  return PLAN_STAGE_TRANSITIONS.find((t) => t.stage === stage)?.label ?? stage
}

export function isVeraMode(value: unknown): value is VeraMode {
  return VERA_MODE_OPTIONS.some((o) => o.value === value)
}

function isDay(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = DAY_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** A title as the calendar will store it: one line, no long dashes (docs/CONTENT-VOICE.md), capped. */
function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
  return t ? t.slice(0, MAX_TITLE) : null
}

/** Text the model wrote for a field, in the house voice: long dashes become commas. Line breaks
 *  stay, because a Notes value may be several lines. */
function cleanText(value: string): string {
  return value.replace(/\s*[\u2013\u2014]\s*/g, ', ')
}

/** `Object.fromEntries` rather than a loop of computed-index writes: every key it lays down is an
 *  own property of a fresh object, whatever the key happens to spell. `checkRepeatRow` has already
 *  refused any key the repeat did not declare, so this is the same second lock as UNSAFE_FIELD_KEYS. */
function cleanRow(row: RepeatRowValue): RepeatRowValue {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'string' ? cleanText(v) : v]),
  ) as RepeatRowValue
}

type Rec = Record<string, unknown>

function parseOne(raw: unknown, at: number): { change: VeraChange } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: `Change ${at} is not an object.` }
  const o = raw as Rec
  const kind = o.kind
  switch (kind) {
    case 'pencil': {
      const title = cleanTitle(o.title)
      if (!title) return { error: `Change ${at} needs a title.` }
      const valid = Array.isArray(o.days) ? o.days.filter(isDay) : []
      if (Array.isArray(o.days) && valid.length !== o.days.length) return { error: `Change ${at} has a date that is not a real day.` }
      const days = [...new Set(valid)].sort()
      if (days.length === 0) return { error: `Change ${at} needs at least one valid date (YYYY-MM-DD).` }
      if (days.length > MAX_PENCIL_DAYS) return { error: `Change ${at} has more than ${MAX_PENCIL_DAYS} dates. Ask for a smaller run.` }
      const timeZone = typeof o.timeZone === 'string' ? o.timeZone.trim().slice(0, 64) : ''
      if (!timeZone) return { error: `Change ${at} needs a time zone.` }
      const hasStart = o.startTime !== undefined && o.startTime !== null && o.startTime !== ''
      const hasEnd = o.endTime !== undefined && o.endTime !== null && o.endTime !== ''
      if (hasStart !== hasEnd) return { error: `Change ${at} needs both a start and an end time, or neither.` }
      if (hasStart && (typeof o.startTime !== 'string' || !TIME_RE.test(o.startTime))) return { error: `Change ${at} has a start time that is not HH:MM.` }
      if (hasEnd && (typeof o.endTime !== 'string' || !TIME_RE.test(o.endTime))) return { error: `Change ${at} has an end time that is not HH:MM.` }
      if (hasStart && (o.startTime as string) >= (o.endTime as string)) return { error: `Change ${at} ends before it starts.` }
      if (o.planId !== undefined && o.planId !== null && !isUuid(o.planId)) return { error: `Change ${at} names a Plan id that is not one of ours.` }
      if (o.stage !== undefined && o.stage !== null && !isVeraMode(o.stage)) return { error: `Change ${at} names a stage that does not exist.` }
      const change: VeraChange = { kind: 'pencil', title, days, timeZone }
      if (hasStart) {
        change.startTime = o.startTime as string
        change.endTime = o.endTime as string
      }
      if (isUuid(o.planId)) change.planId = o.planId
      if (isVeraMode(o.stage)) change.stage = o.stage
      return { change }
    }
    case 'move': {
      if (!isUuid(o.entryId)) return { error: `Change ${at} names a date id that is not one of ours.` }
      if (!isDay(o.toDay)) return { error: `Change ${at} needs a valid day to move to (YYYY-MM-DD).` }
      return { change: { kind: 'move', entryId: o.entryId, toDay: o.toDay } }
    }
    case 'stage': {
      if (!isUuid(o.planId)) return { error: `Change ${at} names a Plan id that is not one of ours.` }
      if (typeof o.stage !== 'string' || !VERA_STAGES.includes(o.stage as WorkflowStage)) {
        return { error: `Change ${at} names a stage that does not exist. The stages are Pencil, Planning, Production and Cancelled.` }
      }
      return { change: { kind: 'stage', planId: o.planId, stage: o.stage as WorkflowStage } }
    }
    case 'retitle': {
      if (!isUuid(o.planId)) return { error: `Change ${at} names a Plan id that is not one of ours.` }
      const title = cleanTitle(o.title)
      if (!title) return { error: `Change ${at} needs the new title.` }
      return { change: { kind: 'retitle', planId: o.planId, title } }
    }
    case 'todo': {
      if (!isUuid(o.planId)) return { error: `Change ${at} names a Plan id that is not one of ours.` }
      const title = cleanTitle(o.title)
      if (!title) return { error: `Change ${at} needs the to-do's title.` }
      let dueOffsetDays: number | null = null
      if (o.dueOffsetDays !== undefined && o.dueOffsetDays !== null) {
        const n = typeof o.dueOffsetDays === 'number' ? o.dueOffsetDays : Number.NaN
        if (!Number.isInteger(n) || Math.abs(n) > MAX_OFFSET_DAYS) return { error: `Change ${at} has a due offset that is not a whole number of days within a year.` }
        dueOffsetDays = n
      }
      return { change: { kind: 'todo', planId: o.planId, title, dueOffsetDays } }
    }
    case 'archive': {
      if (!isUuid(o.planId)) return { error: `Change ${at} names a Plan id that is not one of ours.` }
      return { change: { kind: 'archive', planId: o.planId } }
    }
    case 'field': {
      const target: VeraFieldTarget | null = o.target === 'plan' || o.target === 'entry' ? o.target : null
      if (!target) return { error: `Change ${at} needs a target: a Plan or a date.` }
      if (!isUuid(o.id)) return { error: `Change ${at} names a ${veraTargetNoun(target)} id that is not one of ours.` }
      const path = typeof o.path === 'string' ? o.path.trim() : ''
      const spec = path ? veraFieldSpec(target, path) : null
      if (!spec) {
        const allowed = veraFieldVocabulary()[target].map((s) => s.path).join(', ')
        return { error: `Change ${at} names a field, "${path || 'none'}", that Vera cannot set on a ${veraTargetNoun(target)}. The fields are ${allowed}.` }
      }
      // The kernel checks the value against the field's own kind and options; nothing per field here.
      if (spec.row) {
        const checked = checkRepeatRow(spec.row, o.value)
        if ('problem' in checked) return { error: `Change ${at}: ${checked.problem}` }
        return { change: { kind: 'field', target, id: o.id, path, value: cleanRow(checked.row) } }
      }
      const checked = checkFieldValue(spec.field, o.value)
      if ('problem' in checked) return { error: `Change ${at}: ${checked.problem}` }
      return { change: { kind: 'field', target, id: o.id, path, value: typeof checked.value === 'string' ? cleanText(checked.value) : checked.value } }
    }
    default:
      return { error: `Change ${at} is a kind of change Vera cannot make here.` }
  }
}

/**
 * Validate a proposal strictly, whether it came from the model or back from the browser. Every
 * id must have our UUID shape, every day must be a real day, every stage must be one of ours, and
 * a proposal is at most MAX_VERA_CHANGES long. One bad change fails the whole list: a proposal is
 * reviewed as a whole and applied as a whole, so a half-valid one is not a smaller valid one.
 */
export function parseVeraChanges(raw: unknown): { changes: VeraChange[] } | { error: string } {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as Rec).changes) ? ((raw as Rec).changes as unknown[]) : null
  if (!list) return { error: 'Vera did not return a list of changes.' }
  if (list.length === 0) return { error: 'Vera did not propose any changes. Try saying what should happen and when.' }
  if (list.length > MAX_VERA_CHANGES) return { error: `Vera proposed more than ${MAX_VERA_CHANGES} changes. Ask for a smaller batch.` }
  const changes: VeraChange[] = []
  for (let i = 0; i < list.length; i++) {
    const one = parseOne(list[i], i + 1)
    if ('error' in one) return one
    changes.push(one.change)
  }
  return { changes }
}

/** One line of the house voice: long dashes become commas, exclamation marks become periods,
 *  whitespace collapses. Returns null for anything that is not a non-empty string. */
function cleanLine(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/!/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
  return t || null
}

/**
 * Validate a clarification strictly, whether it came from the model or back from the browser.
 * The question is one line of at most MAX_CLARIFICATION_QUESTION characters; there are two to
 * five options, each with a short label and a distinct value; nothing is truncated to fit, because
 * a question that had to be cut is a question the person cannot answer well.
 */
export function parseVeraClarification(raw: unknown): { clarification: VeraClarification } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Vera asked a question that could not be read.' }
  const o = raw as Rec
  const question = cleanLine(o.question)
  if (!question) return { error: 'Vera asked a question with no words in it.' }
  if (question.length > MAX_CLARIFICATION_QUESTION) return { error: 'Vera asked a question that was too long to show.' }
  if (!Array.isArray(o.options)) return { error: 'Vera asked a question with no options.' }
  if (o.options.length < MIN_CLARIFICATION_OPTIONS) return { error: `Vera asked a question with fewer than ${MIN_CLARIFICATION_OPTIONS} options.` }
  if (o.options.length > MAX_CLARIFICATION_OPTIONS) return { error: `Vera asked a question with more than ${MAX_CLARIFICATION_OPTIONS} options.` }
  const options: VeraClarificationOption[] = []
  const seen = new Set<string>()
  for (let i = 0; i < o.options.length; i++) {
    const item = o.options[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: `Option ${i + 1} is not an option.` }
    const label = cleanLine((item as Rec).label)
    const value = cleanLine((item as Rec).value)
    if (!label) return { error: `Option ${i + 1} has no label.` }
    if (label.length > MAX_CLARIFICATION_LABEL) return { error: `Option ${i + 1} has a label that is too long.` }
    if (!value) return { error: `Option ${i + 1} has no value.` }
    if (value.length > MAX_CLARIFICATION_VALUE) return { error: `Option ${i + 1} has a value that is too long.` }
    if (seen.has(value)) return { error: `Option ${i + 1} repeats an earlier option.` }
    seen.add(value)
    options.push({ label, value })
  }
  return { clarification: { question, options, allowFreeText: o.allowFreeText === true } }
}

/**
 * What a preview line needs to describe itself honestly: the titles it may name, keyed by id, and
 * what a `field` change would overwrite. Built on the SERVER by `buildVeraDescribeContext` and
 * returned with the proposal, because the browser holds only the month it is looking at and would
 * otherwise leave a line reading "Archive that Plan." Missing ids still fall back to a plain noun,
 * which is now a last resort rather than the ordinary case.
 */
export interface VeraDescribeContext {
  plans: Record<string, string>
  entries: Record<string, string>
  /** Keyed by `veraFieldKey`: what the targeted field holds right now, when it holds anything. */
  current?: Record<string, VeraCurrentValue>
}

/** What a `field` change would overwrite: how much text is there, and the text itself when it is
 *  short enough to read on the line. */
export interface VeraCurrentValue {
  chars: number
  /** The whole current value, or null when it is too long to put on one line. */
  text: string | null
}

/** One object's title and its current values, keyed by the same paths a `field` change names. */
export interface VeraSubject {
  title: string
  values: Readonly<Record<string, unknown>>
}

export type VeraSubjects = Record<VeraFieldTarget, Readonly<Record<string, VeraSubject>>>

/** The key a `field` change's current value is filed under. */
export function veraFieldKey(target: VeraFieldTarget, id: string, path: string): string {
  return `${target}:${id}:${path}`
}

/** Longer than this and the current value is reported by size rather than quoted. */
const MAX_QUOTED_CURRENT = 80

function heldValue(value: unknown): VeraCurrentValue | null {
  if (typeof value !== 'string') return null
  const held = value.trim()
  if (!held) return null
  return { chars: held.length, text: held.length <= MAX_QUOTED_CURRENT ? held.replace(/\s+/g, ' ') : null }
}

/** "20,000" without reaching for a locale, so the line reads the same everywhere. */
function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * The context for one proposal, from the rows the propose door already loaded. Only the ids the
 * proposal actually names are carried, so the payload is the size of the proposal and not the size
 * of the Space, and only the paths in the vocabulary are ever read off a subject.
 */
export function buildVeraDescribeContext(changes: readonly VeraChange[], subjects: VeraSubjects): VeraDescribeContext {
  const ctx: VeraDescribeContext = { plans: {}, entries: {}, current: {} }
  const name = (target: VeraFieldTarget, id: string) => {
    const subject = subjects[target]?.[id]
    if (!subject) return
    if (target === 'plan') ctx.plans[id] = subject.title
    else ctx.entries[id] = subject.title
  }
  for (const change of changes) {
    switch (change.kind) {
      case 'pencil':
        if (change.planId) name('plan', change.planId)
        break
      case 'move':
        name('entry', change.entryId)
        break
      case 'stage':
      case 'retitle':
      case 'todo':
      case 'archive':
        name('plan', change.planId)
        break
      case 'field': {
        name(change.target, change.id)
        // A repeat row is ADDED, so nothing is overwritten and there is nothing to warn about.
        const spec = veraFieldSpec(change.target, change.path)
        if (!spec || spec.row) break
        const held = heldValue(subjects[change.target]?.[change.id]?.values[change.path])
        if (held) ctx.current![veraFieldKey(change.target, change.id, change.path)] = held
        break
      }
    }
  }
  return ctx
}

// ONE SHORT DATE, HERE TOO (LIVE-475). This panel used to carry a SECOND short-day formatter of its
// own ("Oct 4"), so a proposal line read "Oct 4, 2026" while the result line printed under it by the
// same panel read "Sun, Oct 4" — two spellings of one day, a few pixels apart, while
// lib/calendar/short-date.ts called itself "the one formatter". There is one now.

function listDays(days: readonly string[]): string {
  const years = new Set(days.map((d) => d.slice(0, 4)))
  const parts = days.map((d) => (years.size > 1 ? `${shortDateLabel(d)}, ${d.slice(0, 4)}` : shortDateLabel(d)))
  const joined = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return years.size > 1 ? joined : `${joined}, ${days[0].slice(0, 4)}`
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

function quoted(title: string | undefined, fallback: string): string {
  return title ? `"${title}"` : fallback
}

/** The sentence that admits a field change is an overwrite. Empty when there is nothing to lose. */
function overwriteNote(held: VeraCurrentValue | null, verb: 'replaces' | 'deletes'): string {
  if (!held || held.chars === 0) return ''
  const what = held.text === null ? `the ${grouped(held.chars)} characters there now` : `what is there now: "${held.text}"`
  return ` That ${verb} ${what}.`
}

/** One plain line per change, for the review list. Camp counselor: plain, no long dashes, no
 *  exclamation. These strings live here rather than in a prompt because they are read by a person
 *  deciding whether to accept, and a proposal's wording must never depend on the model. */
export function describeChange(change: VeraChange, ctx: VeraDescribeContext): string {
  switch (change.kind) {
    case 'pencil': {
      const count = change.days.length
      const when = change.startTime && change.endTime ? `, ${to12h(change.startTime)} to ${to12h(change.endTime)}` : ', all day'
      const where = change.planId
        ? ` on the Plan ${quoted(ctx.plans[change.planId], 'you named')}`
        : ` as a new Plan at ${stageLabel(change.stage ?? 'pencil')}`
      const dates = count === 1 ? `on ${listDays(change.days)}` : `on ${count} dates: ${listDays(change.days)}`
      return `Pencil "${change.title}" ${dates}${when}${where}.`
    }
    case 'move':
      return `Move ${quoted(ctx.entries[change.entryId], 'that date')} to ${shortDateLabel(change.toDay)}, ${change.toDay.slice(0, 4)}. Its anchored to-dos move with it.`
    case 'stage': {
      const plan = quoted(ctx.plans[change.planId], 'that Plan')
      return change.stage === 'cancelled' ? `Mark ${plan} Cancelled, every linked date included.` : `Set ${plan} to ${stageLabel(change.stage)}, every linked date included.`
    }
    case 'retitle':
      return `Rename ${quoted(ctx.plans[change.planId], 'that Plan')} to "${change.title}".`
    case 'todo': {
      const plan = quoted(ctx.plans[change.planId], 'that Plan')
      const n = change.dueOffsetDays ?? null
      const due = n === null ? '' : n === 0 ? ', due on the day' : n < 0 ? `, due ${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} before` : `, due ${n} day${n === 1 ? '' : 's'} after`
      return `Add the to-do "${change.title}" to ${plan}${due}.`
    }
    case 'archive':
      return `Archive ${quoted(ctx.plans[change.planId], 'that Plan')}. Its penciled dates go with it. A date that already became an event keeps the event.`
    case 'field': {
      // The label is the manifest's, never the path: a person reads "Production opens", not targetKind.
      const spec = veraFieldSpec(change.target, change.path)
      const label = spec?.label ?? change.path
      const what = change.target === 'plan' ? quoted(ctx.plans[change.id], 'that Plan') : quoted(ctx.entries[change.id], 'that date')
      if (!spec) return `Set ${label} on ${what}.`
      if (spec.row) return `Add to ${label} on ${what}: ${fieldValueText(spec, change.value)}.`
      // A non-row field is a FULL REPLACEMENT of what is there (a Notes column holds 20,000
      // characters), so the line says so and says how much, rather than letting a full stop hide it.
      const held = ctx.current?.[veraFieldKey(change.target, change.id, change.path)] ?? null
      if (change.value === null) return `Clear ${label} on ${what}.${overwriteNote(held, 'deletes')}`
      return `Set ${label} on ${what} to ${fieldValueText(spec, change.value)}.${overwriteNote(held, 'replaces')}`
    }
  }
}

// ── UNDO (PROG-CAL11 slice 3) ────────────────────────────────────────────────────────────────
//
// The owner asked for versioning alongside the confirmation gates: "I don't want Vera changing
// things without explicit permission." The gate half is above. This half is the record. Every
// accepted proposal writes one row that keeps, per change, WHAT LANDED and WHAT PUTS IT BACK, and
// the record is append only (no update or delete policy exists on the table). Undo reads that row,
// takes the reverses in reverse order, and hands them back as an ordinary proposal: the same
// preview lines, the same two gates, the same actions. Nothing here reverses anything by itself.

/**
 * What the calendar held before one change was applied, as the action read it off the row. It is
 * captured in vera-calendar-actions.ts because that is the only place that knows it: by the time a
 * record is written, the old value is gone.
 */
export type VeraBefore =
  /** A pencil that STARTED a Plan: the Plan it created, which is the thing to take back. */
  | { kind: 'pencil'; createdPlanId: string }
  | { kind: 'move'; day: string }
  | { kind: 'stage'; stage: WorkflowStage }
  | { kind: 'retitle'; title: string }
  | { kind: 'field'; value: VeraFieldValue }

/**
 * The working stage a Plan row's own `stage` column means, as a change Vera can propose. A
 * cancelled Plan's row reads `plan` (the transition table maps Cancelled onto the Planning column
 * and stamps `archived_at`), so the reverse of a cancel is a working stage and never Cancelled
 * again: putting a Plan back is not a second way to cancel it.
 */
export function workingStage(planStage: string): WorkflowStage | null {
  return PLAN_STAGE_TRANSITIONS.find((t) => !t.archived && t.planStage === planStage)?.stage ?? null
}

/**
 * What a `field` change's reverse would set: the value the field holds NOW, put through the same
 * kernel check the forward value went through. Null when this vocabulary cannot carry it back (a
 * repeat row is added rather than replaced, and a held value the field's own rules refuse is not a
 * value Vera can set), and the caller then records a reason instead.
 */
export function veraBeforeFieldValue(spec: VeraFieldSpec, held: unknown): VeraFieldValue | null {
  if (spec.row) return null
  const checked = checkFieldValue(spec.field, held)
  return 'problem' in checked ? null : checked.value
}

/**
 * The change that puts `change` back, in the SAME vocabulary, or null when this vocabulary cannot
 * say it. Pure: the before values come from the action. A pencil that started a Plan reverses to
 * archiving that Plan, which is destructive on purpose, so the undo line arrives unticked and asks
 * for its own confirmation exactly as any other archive does.
 */
export function reverseChange(change: VeraChange, before: VeraBefore | null): VeraChange | null {
  switch (change.kind) {
    case 'pencil':
      return before?.kind === 'pencil' ? { kind: 'archive', planId: before.createdPlanId } : null
    case 'move':
      return before?.kind === 'move' ? { kind: 'move', entryId: change.entryId, toDay: before.day } : null
    case 'stage':
      return before?.kind === 'stage' ? { kind: 'stage', planId: change.planId, stage: before.stage } : null
    case 'retitle':
      return before?.kind === 'retitle' ? { kind: 'retitle', planId: change.planId, title: before.title } : null
    case 'field':
      return before?.kind === 'field' ? { kind: 'field', target: change.target, id: change.id, path: change.path, value: before.value } : null
    // A to-do has no delete verb here, and archiving deleted the Plan's penciled dates outright.
    case 'todo':
    case 'archive':
      return null
  }
}

/** Why a change has no reverse, in plain words, for the person reading the log. */
export function irreversibleReason(change: VeraChange): string {
  switch (change.kind) {
    case 'pencil':
      return 'Undo cannot take dates off a Plan that was already there. Delete those dates on the calendar.'
    case 'todo':
      return 'Undo cannot remove a to-do. Open the Plan and delete it there.'
    case 'archive':
      return 'Undo cannot bring an archived Plan back. Its penciled dates were deleted when it was archived.'
    case 'move':
      return 'Undo cannot tell what day that date was on before.'
    case 'stage':
      return 'Undo cannot tell what stage that Plan was in before.'
    case 'retitle':
      return 'Undo cannot tell what that Plan was called before.'
    case 'field': {
      const spec = veraFieldSpec(change.target, change.path)
      const label = spec?.label ?? change.path
      const noun = veraTargetNoun(change.target)
      return spec?.row
        ? `Undo cannot take a row off ${label}. Remove it on the ${noun}.`
        : `Undo cannot put ${label} back to what it held. Set it on the ${noun} yourself.`
    }
  }
}

/** One applied change in the record: what landed, what it said, and what puts it back. */
export interface VeraLogStep {
  change: VeraChange
  /** The sentence the action returned when the change landed. */
  message: string
  /** The change that reverses it, or null. */
  reverse: VeraChange | null
  /** Why not, when `reverse` is null. */
  reason: string | null
}

/** One accepted proposal, as the console reads it back. */
export interface VeraLogRecord {
  id: string
  /** When it was accepted, ISO. */
  at: string
  steps: VeraLogStep[]
  /** The record this one reversed, when it was an Undo. */
  undoOf: string | null
  /** The later record that reversed this one, when there is one. Derived from the list. */
  undoneBy: string | null
}

/** The most steps one record carries, and the most records the console reads back. */
export const MAX_LOG_RECORDS = 20
/** The longest a recorded sentence may be. Longer is cut on the way in, not on the way out. */
export const MAX_LOG_MESSAGE = 400

function logChange(raw: unknown): VeraChange | null {
  const parsed = parseVeraChanges([raw])
  return 'error' in parsed ? null : parsed.changes[0]
}

/**
 * Read a record's steps back. The rows are ours, and they are parsed anyway: the closed vocabulary
 * moves under a record the day a kind is renamed, and a step that no longer parses must drop out
 * of the log rather than reach an action as a half-understood change. A step whose REVERSE no
 * longer parses keeps its line and loses its Undo, with a reason, which is the same honesty the
 * write path owes.
 */
export function parseVeraLogSteps(raw: unknown): VeraLogStep[] {
  if (!Array.isArray(raw)) return []
  const steps: VeraLogStep[] = []
  for (const item of raw.slice(0, MAX_VERA_CHANGES)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    const change = logChange(o.change)
    if (!change) continue
    const reverse = o.reverse === null || o.reverse === undefined ? null : logChange(o.reverse)
    const message = typeof o.message === 'string' ? o.message.slice(0, MAX_LOG_MESSAGE) : ''
    const reason = reverse ? null : typeof o.reason === 'string' && o.reason ? o.reason.slice(0, MAX_LOG_MESSAGE) : irreversibleReason(change)
    steps.push({ change, message, reverse, reason })
  }
  return steps
}

/**
 * The Undo proposal for one record: every reverse it carries, LAST FIRST. Order is the whole
 * point. A batch that retitled a Plan and then moved its date has to put the date back before the
 * retitle if the two ever touch the same row, and running the list forwards would replay the batch
 * rather than reverse it.
 */
export function undoChanges(steps: readonly VeraLogStep[]): VeraChange[] {
  const out: VeraChange[] = []
  for (let i = steps.length - 1; i >= 0; i--) {
    const reverse = steps[i].reverse
    if (reverse) out.push(reverse)
  }
  return out
}

/** The line at the top of an Undo proposal. Says how much of the batch it can put back, and says
 *  that it is still a proposal: Undo asks in exactly the way every other change asks. */
export function undoNote(steps: readonly VeraLogStep[]): string {
  const total = steps.length
  const back = undoChanges(steps).length
  if (back === 0) return 'Nothing in that batch can be put back from here. Each line says why.'
  const head =
    back === total
      ? total === 1
        ? 'Putting back the one change in that batch.'
        : `Putting back all ${total} changes in that batch, last one first.`
      : `Putting back ${back} of the ${total} changes in that batch, last one first. The rest say why they cannot come back.`
  return `${head} This is a proposal like any other: tick what you want, then accept.`
}
