import type { EntryInput } from '../entries'
import { entryKind } from '../registry'
import { planEntrySave, resolveSeriesSaveChoice, type SeriesSaveChoice, type SeriesSavePlan } from '../series-choice'
import type { SuiteItem } from './adapters'
import { addDays, clockLabel, dayCount, dayLabel, diffDays, lengthLabel, monthDayLabel } from './days'
import type { WriteCall } from './drop'
import { holdRemaining, isHoldLapsed } from './hold'
import type { PlanStage } from './types'

// THE DETAILS PANEL'S PURE HALF. What a field edit in Details means as a write, the lists its
// selects print, and the sentences its plan card speaks. Nothing here touches React, the network or
// the clock (today comes in as an argument), so a test can walk an edit, a series question and a
// copy the way it walks a drop (./drop.ts). The writes are the ones the calendar already has: an
// entry through saveCalendarEntry, one date of a repeating entry through saveCalendarEntryOccurrence.

/** The lengths the Length select offers, in minutes (README 1.3). */
const LENGTHS = [30, 60, 90, 120, 180, 240, 360, 450] as const

/** A select option: the value a form carries and the words a person reads. */
export interface DetailsChoice {
  value: string
  label: string
}

/** The Length select. A length that is not on the list (a 45 minute block) is kept, never lost. */
export function lengthChoices(current: number): DetailsChoice[] {
  const all = LENGTHS.includes(current as (typeof LENGTHS)[number]) || current <= 0 ? [...LENGTHS] : [...LENGTHS, current].sort((a, b) => a - b)
  return all.map((m) => ({ value: String(m), label: lengthLabel(m) }))
}

/** The Starts select: All day, then every half hour from 6 AM to 11:30 PM. A start that is off the grid is kept. */
export function startChoices(current: number | null): DetailsChoice[] {
  const slots: number[] = []
  for (let m = 6 * 60; m <= 23 * 60 + 30; m += 30) slots.push(m)
  if (current != null && !slots.includes(current)) slots.push(current)
  slots.sort((a, b) => a - b)
  return [{ value: 'all', label: 'All day' }, ...slots.map((m) => ({ value: String(m), label: clockLabel(m) }))]
}

/** "14 days before", "on the day", "1 day after"; empty when the to-do is not anchored to a date. */
export function offsetPhrase(offset: number | null | undefined): string {
  if (offset == null) return ''
  if (offset === 0) return 'on the day'
  return offset < 0 ? `${dayCount(-offset)} before` : `${dayCount(offset)} after`
}

/** The line under a to-do on the plan card: "Mon, Oct 26 · 3 days before", "No date · 3 days before". */
export function todoDueLine(due: string | null, offset: number | null | undefined): string {
  const when = due ? dayLabel(due) : offset == null ? 'No date yet' : 'No date'
  const words = offsetPhrase(offset)
  return words ? `${when} · ${words}` : when
}

/** "Holding until Tue, Oct 27 · 6 days left". Details prints the weekday (the board does not). */
export function holdSentence(hold: string | null | undefined, today: string): string {
  if (!hold) return ''
  if (isHoldLapsed(hold, today)) return `Hold lapsed ${dayLabel(hold)}`
  return `Holding until ${dayLabel(hold)} · ${holdRemaining(hold, today)}`
}

/** The to-do an "Add a to-do" field makes: three days before the Plan's date. */
export const NEW_TODO_OFFSET = -3

/** The Plan card's stages as the Plan door spells them (`planning` is `plan` there). */
export function planDoorStage(stage: Exclude<PlanStage, 'event'>): 'pencil' | 'plan' | 'production' | 'cancelled' {
  return stage === 'planning' ? 'plan' : stage
}

/** What a person can change on a date from Details. A key left out is left alone. */
export interface ItemEdit {
  title?: string
  notes?: string
  /** The day it stands on, YYYY-MM-DD. */
  date?: string
  /** Minutes since midnight, or null for all day. */
  startMin?: number | null
  durMin?: number
  /** Move a pencil-kind date to a stage, or call any date off with 'cancelled'. */
  stage?: 'pencil' | 'planning' | 'production' | 'cancelled'
}

/** The write an edit becomes, and the day the date stands on afterwards (to keep it selected). */
interface EditWrite {
  call: WriteCall
  /** The day the edited date stands on once saved. */
  date: string
}

export type EditOutcome =
  | { kind: 'refused'; line: string }
  | { kind: 'noop' }
  | { kind: 'write'; write: EditWrite }
  /** A repeating date: ask which dates the edit reaches. `choose` is null for 'keep'. */
  | { kind: 'ask'; title: string; series: SeriesSavePlan; choose: (choice: SeriesSaveChoice) => EditWrite | null }

/** The reason a date cannot be edited here, or null: it must be one this Space keeps itself. */
function whyNotEditable(item: SuiteItem): string | null {
  const title = item.title || 'That date'
  if (item.shared || item.hostLabel) return `${title} is hosted by another Space, so its team changes it.`
  if (!item.entryId || !item.entryInput) return `${title} is a published event now. Open the event to change it.`
  return null
}

/** 'HH:MM' for minutes since midnight, held inside the day. */
function hhmm(min: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** True when the edit says nothing the date does not already say. */
function changesNothing(item: SuiteItem, edit: ItemEdit): boolean {
  const input = item.entryInput as EntryInput
  if (edit.title !== undefined && edit.title.trim() !== item.title) return false
  if (edit.notes !== undefined && edit.notes.trim() !== (input.notes ?? '').trim()) return false
  if (edit.date !== undefined && edit.date !== item.date) return false
  if (edit.startMin !== undefined && edit.startMin !== item.startMin) return false
  if (edit.durMin !== undefined && edit.durMin !== item.durMin) return false
  if (edit.stage !== undefined && edit.stage !== (entryKind(input.kind)?.isPencil ? (input.stage ?? 'pencil') : input.status === 'cancelled' ? 'cancelled' : null)) return false
  return true
}

/** The entry's own input with the edit laid on it. `whole` writes the master of a series (every date
 *  shifts together); otherwise it writes ONE date, which stands on its own day. */
function inputWith(item: SuiteItem, edit: ItemEdit, whole: boolean): EntryInput {
  const input = item.entryInput as EntryInput
  const next: EntryInput = { ...input, candidateDates: [] }
  if (edit.title !== undefined) next.title = edit.title.trim()
  if (edit.notes !== undefined) next.notes = edit.notes.trim() || null
  if (edit.date !== undefined && edit.date !== item.date) {
    const delta = diffDays(item.date, edit.date)
    if (whole) {
      next.startDate = addDays(input.startDate, delta)
      next.endDate = addDays(input.endDate, delta)
      next.exceptionDates = (input.exceptionDates ?? []).map((d) => addDays(d, delta))
    } else {
      const span = diffDays(input.startDate, input.endDate)
      next.startDate = edit.date
      next.endDate = addDays(edit.date, span)
    }
  } else if (!whole) {
    // One date of a series stands on its own day, not on the master's first.
    const span = diffDays(input.startDate, input.endDate)
    next.startDate = item.date
    next.endDate = addDays(item.date, span)
  }
  const startMin = edit.startMin !== undefined ? edit.startMin : item.startMin
  const durMin = edit.durMin ?? (item.durMin > 0 ? item.durMin : 60)
  if (edit.startMin !== undefined || edit.durMin !== undefined) {
    if (startMin == null) {
      next.allDay = true
    } else {
      next.allDay = false
      next.endDate = next.startDate
      next.startTime = hhmm(startMin)
      next.endTime = hhmm(Math.min(startMin + durMin, 1439))
    }
  }
  if (edit.stage !== undefined) {
    // Only an event on its way carries a stage; a private or unavailable entry is called off by its status.
    if (entryKind(input.kind)?.isPencil) next.stage = edit.stage
    else if (edit.stage === 'cancelled') next.status = 'cancelled'
  }
  return next
}

/**
 * What an edit of one field of a date does. A one-off saves through the entry write. A repeating
 * date asks first (which dates does this reach?), the same question every drop path asks, and never
 * writes before the answer. A published event, a date another Space hosts, and a blank title are
 * refused with their sentence.
 */
export function planItemEdit(item: SuiteItem, edit: ItemEdit): EditOutcome {
  const refused = whyNotEditable(item)
  if (refused) return { kind: 'refused', line: refused }
  if (edit.title !== undefined && !edit.title.trim()) return { kind: 'refused', line: 'Give the date a title.' }
  if (edit.stage && edit.stage !== 'cancelled' && !entryKind((item.entryInput as EntryInput).kind)?.isPencil) {
    return { kind: 'refused', line: 'Only a Pencil, a Plan date or a production has stages.' }
  }
  if (changesNothing(item, edit)) return { kind: 'noop' }
  const input = item.entryInput as EntryInput
  const entryId = item.entryId as string
  const date = edit.date ?? item.date
  const series = planEntrySave({ kind: input.kind, repeat: input.repeat, occurrenceDate: item.occurrenceDate ?? item.date })
  if (!series.ask) {
    return { kind: 'write', write: { call: { type: 'entry', entryId, input: inputWith(item, edit, true) }, date } }
  }
  return {
    kind: 'ask',
    title: item.title,
    series,
    choose: (choice) => {
      const action = resolveSeriesSaveChoice(choice, series)
      if (action === 'splitSeriesAt' && series.thisDate) {
        return { call: { type: 'occurrence', entryId, day: series.thisDate, input: inputWith(item, edit, false) }, date }
      }
      if (action === 'saveSeries') return { call: { type: 'entry', entryId, input: inputWith(item, edit, true) }, date }
      return null
    },
  }
}

/** The new date "Copy to next week" makes: this one, a week later, as a one-off. Null for a date that
 *  is not an entry this Space keeps (a published event, a date another Space hosts). */
export function nextWeekCopy(item: SuiteItem): { input: EntryInput; date: string; line: string } | null {
  if (whyNotEditable(item)) return null
  const input = item.entryInput as EntryInput
  const date = addDays(item.date, 7)
  const span = diffDays(input.startDate, input.endDate)
  return {
    input: {
      ...input,
      startDate: date,
      endDate: addDays(date, span),
      candidateDates: [],
      repeat: '',
      exceptionDates: [],
      // A copy is a new date: it does not inherit a skip or a lapse that belonged to the first.
      holdExpiresOn: input.holdExpiresOn ? addDays(input.holdExpiresOn, 7) : input.holdExpiresOn,
    },
    date,
    line: `Copied ${item.title} to ${dayLabel(date)}.`,
  }
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", or "Oct 3" (README 2: ago). `nowMs` is the clock. */
export function agoLabel(iso: string, nowMs: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const mins = Math.max(0, (nowMs - t) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.floor(mins)} min ago`
  const hours = mins / 60
  if (hours < 24) return `${Math.round(hours)} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return monthDayLabel(new Date(t).toISOString().slice(0, 10))
}
