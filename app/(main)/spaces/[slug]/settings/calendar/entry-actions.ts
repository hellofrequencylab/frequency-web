'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { candidateWrites, entryDaySpan, MAX_CANDIDATE_DATES, parseEntryInput, type EntryInput } from '@/lib/calendar/entries'
import { asDayKey, expandPencilSeries, seriesRule, withExceptionDate } from '@/lib/calendar/pencil-series'
import { parseDayNoteInput, type DayNoteInput } from '@/lib/calendar/day-notes'
import { deleteDayNote, insertDayNote, listDayNotes, updateDayNote } from '@/lib/calendar/day-notes-store'
import { listSpaceCalendarEvents } from '@/lib/events/store'
import {
  countOptionGroup,
  deleteCalendarEntryRow,
  getCalendarEntryRow,
  insertCalendarEntries,
  keepPencilDateRow,
  listSpaceCalendarEntries,
  listStaffCalendarItems,
  setEntryExceptionDates,
  updateCalendarEntryRow,
} from '@/lib/calendar/entries-store'
import { monthGridWindow, safeMonth } from '@/lib/calendar/month-window'
import { entryKind, entryStage } from '@/lib/calendar/registry'
import type { CalendarEvent } from '@/lib/calendar/item'
import { listDueDateItems } from '@/lib/calendar/due-dates-store'
import { reanchorPlanTodos, transitionPlanStage } from './plan-actions'
import { log } from '@/lib/log'

// THE PRIVATE CALENDAR ACTIONS (ADR-1385). Create, edit and delete a Space's private entries, and read
// one month of them. Gated twice: here (the caller edits this Space and it has the Calendar function)
// for a plain error, and in the database (the RLS quad on space_calendar_entries) as the real lock,
// since every write runs on the caller's own session.

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

export async function saveCalendarEntry(
  slug: string,
  entryId: string | null,
  input: EntryInput,
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (entryId !== null && !UUID_RE.test(entryId)) return fail('That entry no longer exists.')
  const parsed = parseEntryInput(input)
  if ('error' in parsed) return fail(parsed.error)
  const w = parsed.data
  // Candidate dates only exist while an event on its way is still a Pencil.
  const extra = w.stage === 'pencil' ? candidateWrites(w, input.candidateDates) : []
  if ('error' in extra) return fail(extra.error)

  let res: { data: unknown } | { error: string }
  /** Set when a Plan-linked date actually changed day, so its anchored to-dos follow it. */
  let movedPlanId: string | null = null
  if (!entryId) {
    res = await insertCalendarEntries(editor.spaceId, [w, ...extra], editor.profileId)
  } else {
    const current = await getCalendarEntryRow(editor.spaceId, entryId)
    if (!current) return fail('That entry no longer exists.')
    const inGroup = current.option_group ? await countOptionGroup(editor.spaceId, current.option_group) : 1
    // A date that is one of several must be settled before it moves on, or the other dates would be
    // left behind as stray Pencils of something that is already Planning.
    if (inGroup > 1 && w.kind !== current.kind) return fail('This is one of several possible dates. Keep one date before you change its type.')
    if (inGroup > 1 && w.stage !== 'pencil') return fail('This is one of several possible dates. Keep one date before you move it past Pencil.')
    if (inGroup + extra.length > MAX_CANDIDATE_DATES) return fail(`A pencil can hold ${MAX_CANDIDATE_DATES} dates at most.`)
    if (current.plan_id && w.stage && w.stage !== current.stage) {
      const planStage = w.stage === 'planning' ? 'plan' : w.stage
      const moved = await transitionPlanStage(slug, current.plan_id, planStage)
      if ('error' in moved) return moved
    }
    if (extra.length === 0) {
      res = await updateCalendarEntryRow(editor.spaceId, entryId, w)
    } else {
      const group = current.option_group ?? crypto.randomUUID()
      res = await updateCalendarEntryRow(editor.spaceId, entryId, w, group)
      if (!('error' in res)) res = await insertCalendarEntries(editor.spaceId, extra, editor.profileId, group)
    }
    // MOVE THE DATE, MOVE THE PREP LIST (ADR-1386 P5). The one mechanic that makes an attached
    // checklist worth more than a notes app: every to-do anchored "14 days before" stays 14 days
    // before when the date slips, and a to-do with a fixed date stays put.
    if (!('error' in res) && current.plan_id && current.starts_at.slice(0, 10) !== w.starts_at.slice(0, 10)) {
      movedPlanId = current.plan_id
    }
  }
  if ('error' in res) return fail(res.error)
  if (movedPlanId) {
    // The DATE moved, and it moved successfully. A checklist that failed to follow it is a real
    // regression, but it is not a reason to tell the owner their date did not save — so it is
    // reported to the log, where a gate can see it, rather than swallowed or thrown at the form.
    const anchored = await reanchorPlanTodos(slug, movedPlanId)
    if ('error' in anchored) {
      log.error('calendar.plan.reanchor_failed', {
        plan_id: movedPlanId,
        entry_id: entryId,
        day_key: w.starts_at.slice(0, 10),
      })
    }
  }
  revalidate(slug)
  return ok()
}

export async function deleteCalendarEntry(slug: string, entryId: string): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(entryId)) return fail('That entry no longer exists.')
  const res = await deleteCalendarEntryRow(editor.spaceId, entryId)
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  return ok()
}

/** SKIP ONE DATE OF A REPEATING PENCIL (PROG-CAL5). Appends the occurrence's day to the master's
 *  `exception_dates`, and that is the whole write: the rule is untouched, the cadence carries on
 *  around the gap, and the date comes back only when a person removes it in the drawer. Gated
 *  exactly like deleteCalendarEntry: the caller edits this Space, and the table's RLS is the lock. */
export async function skipPencilDate(slug: string, entryId: string, dayKey: string): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(entryId)) return fail('That entry no longer exists.')
  const day = asDayKey(dayKey)
  if (!day) return fail('Pick a valid date to skip.')
  const current = await getCalendarEntryRow(editor.spaceId, entryId)
  if (!current) return fail('That entry no longer exists.')
  if (!seriesRule(current)) return fail('This date does not repeat, so there is nothing to skip. Delete it instead.')
  const res = await setEntryExceptionDates(editor.spaceId, entryId, withExceptionDate(current.exception_dates, day))
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  return ok()
}

/** One month of private entries for the staff calendar. [] for anyone who cannot edit the Space. */
export async function loadStaffCalendarMonth(slug: string, year: number, month1: number): Promise<CalendarEvent[]> {
  const month = safeMonth(year, month1)
  if (!month) return []
  const editor = await resolveEditor(slug)
  if (!editor) return []
  const { fromDay, toDay } = monthGridWindow(month.year, month.month1)
  const [items, dueItems] = await Promise.all([
    listStaffCalendarItems(editor.spaceId, fromDay, toDay, { editable: true }),
    listDueDateItems(editor.spaceId, fromDay, toDay),
  ])
  return [...items, ...dueItems]
}

/** Keep one candidate date of a pencil and remove the others, atomically (ADR-1386, ADR-1388). */
export async function pickPencilDate(slug: string, entryId: string): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(entryId)) return fail('That entry no longer exists.')
  const res = await keepPencilDateRow(editor.spaceId, entryId)
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  return ok()
}

/** What the entry being edited would overlap: events on this Space's calendar and its other entries.
 *  A warning, never a block (ADR-1386). Titles only; [] for anyone who cannot edit the Space. */
export async function findEntryClashes(slug: string, entryId: string | null, input: EntryInput): Promise<string[]> {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  const parsed = parseEntryInput(input)
  if ('error' in parsed) return []
  const w = parsed.data
  // A cancelled date is not competing for the time, so there is nothing to warn about.
  if (w.status === 'cancelled') return []
  const { dayKey, endDayKey } = entryDaySpan(w)
  const toDay = new Date(Date.UTC(+endDayKey.slice(0, 4), +endDayKey.slice(5, 7) - 1, +endDayKey.slice(8, 10) + 1))
    .toISOString()
    .slice(0, 10)
  const overlaps = (s: string, e: string | null) => s < w.ends_at && (e ?? s) > w.starts_at
  const [entries, events] = await Promise.all([
    listSpaceCalendarEntries(editor.spaceId, dayKey, toDay),
    listSpaceCalendarEvents(editor.spaceId, { fromDay: dayKey }),
  ])
  const out: string[] = []
  for (const ev of events) {
    if (ev.starts_at.slice(0, 10) > endDayKey) continue
    // An event with no end counts as its start hour.
    const end = ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + 3_600_000).toISOString()
    if (overlaps(ev.starts_at, end)) out.push(`Event: ${ev.title}`)
  }
  for (const en of entries) {
    if (en.id === entryId || en.status === 'cancelled') continue
    // A repeating entry competes for the time on each of its landings in these days, skips excluded.
    const label = `${entryStage(en.stage)?.label ?? entryKind(en.kind)?.label ?? 'Entry'}: ${en.title}`
    if (expandPencilSeries(en, { fromDay: dayKey, toDay }).some((o) => overlaps(o.starts_at, o.ends_at))) out.push(label)
  }
  return out.slice(0, 6)
}

async function nextDayNoteSort(spaceId: string): Promise<number> {
  return (await listDayNotes(spaceId)).length
}

export async function saveDayNote(slug: string, id: string | null, input: DayNoteInput): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (id !== null && !UUID_RE.test(id)) return fail('That note no longer exists.')
  const parsed = parseDayNoteInput(input)
  if ('error' in parsed) return fail(parsed.error)
  const res = id
    ? await updateDayNote(editor.spaceId, id, parsed.data)
    : await insertDayNote(editor.spaceId, parsed.data, editor.profileId, await nextDayNoteSort(editor.spaceId))
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  return ok()
}

export async function removeDayNote(slug: string, id: string): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this calendar.')
  if (!UUID_RE.test(id)) return fail('That note no longer exists.')
  const res = await deleteDayNote(editor.spaceId, id)
  if ('error' in res) return fail(res.error)
  revalidate(slug)
  return ok()
}
