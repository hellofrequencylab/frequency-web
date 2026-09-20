'use server'

import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { loadPublicSpaceWindow } from '@/lib/calendar/public-month'
import { monthGridWindow, safeMonth } from '@/lib/calendar/month-window'
import type { CalendarEvent } from '@/lib/calendar/item'
import { loadAdminCalendar } from '@/lib/calendar/admin-calendar'
import { getSpaceCapabilities, resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'

/** One month of a Space's PUBLIC calendar, for browsing past the window the page loaded (ADR-1385).
 *  A read: the Space must be visible to the caller, and every event passes the same gates the page
 *  uses. Fails safe to [] for a bad month or a Space the caller cannot see. */
export async function loadSpaceCalendarMonth(slug: string, year: number, month1: number): Promise<CalendarEvent[]> {
  const month = safeMonth(year, month1)
  if (!month || typeof slug !== 'string') return []
  const space = await getVisibleSpaceBySlug(slug, await getMyProfileId())
  if (!space) return []
  const { fromDay, toDay } = monthGridWindow(month.year, month.month1)
  return loadPublicSpaceWindow(space.id, fromDay, toDay)
}

/** One month of the private operator calendar. Access is re-checked on every viewport request. */
export async function loadAdminSpaceCalendarMonth(
  slug: string,
  year: number,
  month1: number,
): Promise<CalendarEvent[]> {
  const month = safeMonth(year, month1)
  if (!month || typeof slug !== 'string') return []
  const caller = await getCallerProfile()
  if (!caller) return []
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return []
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller.id, caller.webRole)
  const allowed =
    staffViewing ||
    (canManage && spaceFunctionAccess(space, 'events', (await getSpaceCapabilities(space, caller.id)).role))
  if (!allowed) return []
  const admin = await loadAdminCalendar(space.id, {
    canManage,
    year: month.year,
    month1: month.month1,
    now: new Date(),
  })
  return admin.events
}
