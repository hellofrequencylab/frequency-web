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
// A change that cannot be expressed here cannot be proposed, which is the point.

import { PLAN_STAGE_TRANSITIONS, type WorkflowStage } from './workflow-board'
import type { PlanStage } from './plans'

export type VeraMode = PlanStage

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

export type VeraChangeKind = VeraChange['kind']

export const VERA_CHANGE_KINDS: readonly VeraChangeKind[] = ['pencil', 'move', 'stage', 'retitle', 'todo', 'archive']

/** The most changes one proposal may carry. A bigger ask is two asks. */
export const MAX_VERA_CHANGES = 40
/** The most dates one pencil change may carry (a year of new moons is 13; a weekly season is 26). */
export const MAX_PENCIL_DAYS = 60
const MAX_TITLE = 200
const MAX_OFFSET_DAYS = 365

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

/** Titles the description lines can name, keyed by id. Missing ids fall back to a plain noun. */
export interface VeraDescribeContext {
  plans: Record<string, string>
  entries: Record<string, string>
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jan 18" from "2026-01-18". A bad key comes back as typed rather than throwing on a label. */
export function shortDay(day: string): string {
  const m = DAY_RE.exec(day)
  if (!m) return day
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`
}

function listDays(days: readonly string[]): string {
  const years = new Set(days.map((d) => d.slice(0, 4)))
  const parts = days.map((d) => (years.size > 1 ? `${shortDay(d)}, ${d.slice(0, 4)}` : shortDay(d)))
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
      return `Move ${quoted(ctx.entries[change.entryId], 'that date')} to ${shortDay(change.toDay)}, ${change.toDay.slice(0, 4)}. Its anchored to-dos move with it.`
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
      return `Archive ${quoted(ctx.plans[change.planId], 'that Plan')}. Its pencilled dates go with it. A date that already became an event keeps the event.`
  }
}
