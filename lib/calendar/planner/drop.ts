import type { EntryInput } from '../entries'
import { planEntrySave, resolveSeriesSaveChoice, type SeriesSaveChoice, type SeriesSavePlan } from '../series-choice'
import type { SuiteItem, SuiteTask } from './adapters'
import { addDays, clockLabel, dayCount, dayLabel, diffDays } from './days'
import { dropTodoOnDay, dropTodoOnTime } from './inbox-drop'
import type { PlannerItem, PlannerTask } from './types'
import { SNAP_MINUTES, moveBandToDay, moveToTime, snapMinutes } from './week-layout'

// DROPPING AN ITEM. Every drag on the calendar (a Month chip on a day, a Week or Day card on a time or
// a day, an Agenda row on a day card, an Inbox to-do on either) ends in one function here, and the
// answer is the same whichever view the hand was in: a refusal with its sentence, nothing to do, one
// move that is ready, or a question about a repeating date. A move is a PLAN: what the grid draws
// until the server answers, the one write that makes it true, and the one write that takes it back.
// Nothing here touches the DOM, React or the network, so a test can walk a drop and its Undo.
//
// The writes are the ones the calendar already has. A date moves through saveCalendarEntry (which also
// carries a Plan's to-dos along); ONE date of a repeating entry moves through
// saveCalendarEntryOccurrence; a to-do moves its due day. A published event is not an entry, so it
// keeps the sentence date-move.ts already gives it: open the event to change its date.

/** Where a drop landed: a day (a Month cell, an Agenda card, the all-day row) or a time on a day. */
export type DropTarget = { zone: 'day'; day: string } | { zone: 'time'; day: string; startMin: number }

/** What a grid needs to draw an item: its place on the calendar. */
export interface ItemPlace {
  date: string
  end: string | null
  startMin: number | null
  durMin: number
}

/** What a grid needs to draw a to-do: its due day and, once dropped on a time, its block. */
export interface TodoPlace {
  due: string | null
  startMin: number | null
}

/** The one server write a move is. */
export type WriteCall =
  | { type: 'entry'; entryId: string; input: EntryInput }
  | { type: 'occurrence'; entryId: string; day: string; input: EntryInput }
  | { type: 'todo'; id: string; due: string | null; startMin?: number | null }

export interface MovePlan {
  /** Items whose place changes, each with the place it had and the place it takes. */
  items: { id: string; before: ItemPlace; after: ItemPlace }[]
  todo: { id: string; before: TodoPlace; after: TodoPlace } | null
  write: WriteCall
  /** The single write that restores the snapshot, or null when this move has none. */
  undo: WriteCall | null
  /** What the toast says once it is saved. */
  line: string
}

export type DropOutcome =
  | { kind: 'refused'; line: string }
  | { kind: 'noop' }
  | { kind: 'ready'; plan: MovePlan }
  /** A repeating date: ask this date or the series first. `choose` is null for 'keep'. */
  | { kind: 'ask'; title: string; series: SeriesSavePlan; choose: (choice: SeriesSaveChoice) => MovePlan | null }

const placeOf = (i: Pick<PlannerItem, 'date' | 'end' | 'startMin' | 'durMin'>): ItemPlace => ({
  date: i.date,
  end: i.end ?? null,
  startMin: i.startMin,
  durMin: i.durMin,
})

const samePlace = (a: ItemPlace, b: ItemPlace) =>
  a.date === b.date && a.end === b.end && a.startMin === b.startMin && a.durMin === b.durMin

/** 'HH:MM' for minutes since midnight, held inside the day. */
function hhmm(min: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function snapTarget(target: DropTarget): DropTarget {
  return target.zone === 'time' ? { ...target, startMin: snapMinutes(target.startMin, SNAP_MINUTES) } : target
}

/** The place an item takes on a drop. A day keeps its time and its length; a time makes it one timed day. */
function placeAfter(item: PlannerItem, target: DropTarget): ItemPlace {
  if (target.zone === 'time') {
    const m = moveToTime(item, target.day, target.startMin)
    return { date: m.date, end: null, startMin: m.startMin, durMin: m.durMin }
  }
  const m = moveBandToDay(item, target.day)
  return { date: m.date, end: m.end, startMin: item.startMin, durMin: item.durMin }
}

/** The drawer's own input for a single date, on its new place. A day drop moves the dates and leaves the
 *  times as they were; a time drop makes it one timed day. */
function inputFor(input: EntryInput, after: ItemPlace, target: DropTarget): EntryInput {
  const base: EntryInput = { ...input, candidateDates: [] }
  if (target.zone === 'time' && after.startMin != null) {
    return {
      ...base,
      allDay: false,
      startDate: after.date,
      endDate: after.date,
      startTime: hhmm(after.startMin),
      endTime: hhmm(Math.min(after.startMin + after.durMin, 1439)),
    }
  }
  return { ...base, startDate: after.date, endDate: after.end ?? after.date }
}

/** The master's input moved as a whole: every date of the series shifts by `delta` days. */
function seriesInputFor(input: EntryInput, delta: number, target: DropTarget, durMin: number): EntryInput {
  const shifted = (day: string) => addDays(day, delta)
  const base: EntryInput = {
    ...input,
    candidateDates: [],
    startDate: shifted(input.startDate),
    endDate: shifted(input.endDate),
    exceptionDates: (input.exceptionDates ?? []).map(shifted),
  }
  if (target.zone !== 'time') return base
  return {
    ...base,
    allDay: false,
    endDate: base.startDate,
    startTime: hhmm(target.startMin),
    endTime: hhmm(Math.min(target.startMin + (durMin > 0 ? durMin : 60), 1439)),
  }
}

function lineFor(title: string, after: ItemPlace): string {
  const when = after.startMin != null && !after.end ? `${dayLabel(after.date)}, ${clockLabel(after.startMin)}` : dayLabel(after.date)
  return `Moved ${title} to ${when}.`
}

/** The refusal an item gets before it is even asked: it is not a date this Space can move by hand. */
function refusal(item: SuiteItem): string | null {
  const title = item.title || 'That date'
  if (item.kind === 'cancelled') return `${title} is cancelled. It stays where it was.`
  if (item.shared || item.hostLabel) return `${title} is hosted by another Space, so its date moves there.`
  if (!item.entryId || !item.entryInput) {
    return `${title} is a published event now. Open the event to change its date.`
  }
  return null
}

/** What a drop of one item on a target does. `all` is every item on the calendar, to find a series. */
export function planItemDrop(item: SuiteItem, rawTarget: DropTarget, all: readonly SuiteItem[]): DropOutcome {
  const refused = refusal(item)
  if (refused) return { kind: 'refused', line: refused }
  const target = snapTarget(rawTarget)
  const before = placeOf(item)
  const after = placeAfter(item, target)
  if (samePlace(before, after)) return { kind: 'noop' }
  const input = item.entryInput as EntryInput
  const entryId = item.entryId as string
  const title = item.title || 'That date'

  const seriesPlan = planEntrySave({ kind: input.kind, repeat: input.repeat, occurrenceDate: item.occurrenceDate ?? item.date })
  if (!seriesPlan.ask) {
    return {
      kind: 'ready',
      plan: {
        items: [{ id: item.id, before, after }],
        todo: null,
        write: { type: 'entry', entryId, input: inputFor(input, after, target) },
        undo: { type: 'entry', entryId, input },
        line: lineFor(title, after),
      },
    }
  }

  // A repeating entry is one row. Dropping one of its dates asks which dates the move reaches, on
  // every path a drop can take, and never writes before the answer.
  const delta = diffDays(item.date, target.day)
  return {
    kind: 'ask',
    title,
    series: seriesPlan,
    choose: (choice) => {
      const action = resolveSeriesSaveChoice(choice, seriesPlan)
      if (action === 'splitSeriesAt' && seriesPlan.thisDate) {
        return {
          items: [{ id: item.id, before, after }],
          todo: null,
          write: { type: 'occurrence', entryId, day: seriesPlan.thisDate, input: inputFor(input, after, target) },
          // Splitting makes a new row for this date; no single write puts it back, so there is no Undo.
          undo: null,
          line: `${lineFor(title, after)} It is its own date now, outside the series.`,
        }
      }
      if (action === 'saveSeries') {
        const sameSeries = all.filter((i) => i.entryId === entryId)
        const moved = sameSeries.map((i) => {
          const b = placeOf(i)
          const a: ItemPlace =
            target.zone === 'time'
              ? { date: addDays(i.date, delta), end: null, startMin: target.startMin, durMin: i.durMin > 0 ? i.durMin : 60 }
              : { date: addDays(i.date, delta), end: i.end ? addDays(i.end, delta) : null, startMin: i.startMin, durMin: i.durMin }
          return { id: i.id, before: b, after: a }
        })
        const line =
          delta === 0
            ? `Moved every ${title} to ${target.zone === 'time' ? clockLabel(target.startMin) : 'its new place'}.`
            : `Moved ${title} and every repeat ${dayCount(Math.abs(delta))} ${delta < 0 ? 'earlier' : 'later'}.`
        return {
          items: moved,
          todo: null,
          write: { type: 'entry', entryId, input: seriesInputFor(input, delta, target, item.durMin) },
          undo: { type: 'entry', entryId, input },
          line,
        }
      }
      return null
    },
  }
}

/** What a drop of a to-do on a target does: the SAME to-do gets a due day (and, on a time, a block). */
export function planTodoDrop(task: SuiteTask, rawTarget: DropTarget): DropOutcome {
  const title = task.title || 'That to-do'
  if (task.sharedFrom) return { kind: 'refused', line: `${title} belongs to ${task.sharedFrom}'s Plan, so their team moves it.` }
  const target = snapTarget(rawTarget)
  const before: TodoPlace = { due: task.due, startMin: task.startMin ?? null }
  const update = target.zone === 'time' ? dropTodoOnTime(task, target.day, target.startMin) : dropTodoOnDay(task, target.day)
  const after: TodoPlace = { due: update.patch.due, startMin: update.patch.startMin ?? task.startMin ?? null }
  if (before.due === after.due && before.startMin === after.startMin) return { kind: 'noop' }
  // The block's time rides in crm_tasks.start_minute; the DAY stays in due_at, so the same row updates.
  const timed = target.zone === 'time'
  return {
    kind: 'ready',
    plan: {
      items: [],
      todo: { id: task.id, before, after },
      write: { type: 'todo', id: task.id, due: update.patch.due, ...(timed ? { startMin: after.startMin } : {}) },
      undo: { type: 'todo', id: task.id, due: task.due, ...(timed ? { startMin: task.startMin ?? null } : {}) },
      line: timed
        ? `${title} is due ${dayLabel(update.patch.due)} at ${clockLabel(target.startMin)}.`
        : `${title} is due ${dayLabel(update.patch.due)}.`,
    },
  }
}

/** The items with their moved places laid over them. Ids not in `over` are untouched. */
export function overlayItems<T extends PlannerItem>(items: readonly T[], over: Readonly<Record<string, ItemPlace>>): T[] {
  return items.map((i) => (over[i.id] ? { ...i, ...over[i.id] } : i))
}

/** The to-dos with their moved places laid over them. */
export function overlayTasks<T extends PlannerTask>(tasks: readonly T[], over: Readonly<Record<string, TodoPlace>>): T[] {
  return tasks.map((t) => (over[t.id] ? { ...t, due: over[t.id].due, startMin: over[t.id].startMin } : t))
}

/** The places a plan restores: the `before` of every change it made. */
export function planBefore(plan: MovePlan): { items: Record<string, ItemPlace>; todo: Record<string, TodoPlace> } {
  return {
    items: Object.fromEntries(plan.items.map((c) => [c.id, c.before])),
    todo: plan.todo ? { [plan.todo.id]: plan.todo.before } : {},
  }
}

/** The places a plan draws: the `after` of every change it makes. */
export function planAfter(plan: MovePlan): { items: Record<string, ItemPlace>; todo: Record<string, TodoPlace> } {
  return {
    items: Object.fromEntries(plan.items.map((c) => [c.id, c.after])),
    todo: plan.todo ? { [plan.todo.id]: plan.todo.after } : {},
  }
}

/** The calls a runner needs: the three writes a move can be, bound to one Space. */
export interface WriteDeps {
  saveEntry: (entryId: string, input: EntryInput) => Promise<{ error: string } | { data?: unknown }>
  saveOccurrence: (entryId: string, day: string, input: EntryInput) => Promise<{ error: string } | { data?: unknown }>
  moveTodo: (id: string, due: string | null, startMin?: number | null) => Promise<{ error: string } | { data?: unknown }>
}

/** Runs one write. Resolves to the error sentence, or null when it saved. A thrown call is an error too. */
export async function runWrite(call: WriteCall, deps: WriteDeps): Promise<string | null> {
  try {
    const res =
      call.type === 'entry'
        ? await deps.saveEntry(call.entryId, call.input)
        : call.type === 'occurrence'
          ? await deps.saveOccurrence(call.entryId, call.day, call.input)
          : await deps.moveTodo(call.id, call.due, call.startMin)
    return 'error' in res ? res.error : null
  } catch {
    return 'Something went wrong. Try again.'
  }
}
