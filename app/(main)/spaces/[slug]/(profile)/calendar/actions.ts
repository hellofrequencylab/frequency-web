'use server'

import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { loadPublicSpaceWindow } from '@/lib/calendar/public-month'
import { monthGridWindow, safeMonth } from '@/lib/calendar/month-window'
import type { CalendarEvent } from '@/lib/calendar/item'

/** One month of a Space's PUBLIC calendar, for browsing past the window the page loaded (ADR-1385).
 *  A read: the Space must be visible to the caller, and every event passes the same gates the page
 *  uses. Fails safe to [] for a bad month or a Space the caller cannot see.
 *
 *  The private operator month is NOT here. It is `loadStaffCalendarMonth` in
 *  `app/(main)/spaces/[slug]/settings/calendar/entry-actions.ts`, which `StaffCalendar` wires as
 *  its `loadMonth` (ADR-1511). */
export async function loadSpaceCalendarMonth(slug: string, year: number, month1: number): Promise<CalendarEvent[]> {
  const month = safeMonth(year, month1)
  if (!month || typeof slug !== 'string') return []
  const space = await getVisibleSpaceBySlug(slug, await getMyProfileId())
  if (!space) return []
  const { fromDay, toDay } = monthGridWindow(month.year, month.month1)
  return loadPublicSpaceWindow(space.id, fromDay, toDay)
}
