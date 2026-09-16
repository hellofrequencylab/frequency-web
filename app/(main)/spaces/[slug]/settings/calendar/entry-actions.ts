'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { parseEntryInput, type EntryInput } from '@/lib/calendar/entries'
import {
  deleteCalendarEntryRow,
  insertCalendarEntry,
  listStaffCalendarItems,
  updateCalendarEntryRow,
} from '@/lib/calendar/entries-store'
import { monthGridWindow, safeMonth } from '@/lib/calendar/month-window'
import type { CalendarEvent } from '@/lib/calendar/item'

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
  const res = entryId
    ? await updateCalendarEntryRow(editor.spaceId, entryId, parsed.data)
    : await insertCalendarEntry(editor.spaceId, parsed.data, editor.profileId)
  if ('error' in res) return fail(res.error)
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

/** One month of private entries for the staff calendar. [] for anyone who cannot edit the Space. */
export async function loadStaffCalendarMonth(slug: string, year: number, month1: number): Promise<CalendarEvent[]> {
  const month = safeMonth(year, month1)
  if (!month) return []
  const editor = await resolveEditor(slug)
  if (!editor) return []
  const { fromDay, toDay } = monthGridWindow(month.year, month.month1)
  return listStaffCalendarItems(editor.spaceId, fromDay, toDay, { editable: true })
}
