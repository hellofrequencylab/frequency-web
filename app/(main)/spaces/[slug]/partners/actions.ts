'use server'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { monthGridWindow, safeMonth } from '@/lib/calendar/month-window'
import type { CalendarEvent } from '@/lib/calendar/item'
import { spacePlanTab } from '@/lib/collective/partners'
import { loadPartnersCalendarWindow, loadPartnersView } from '@/lib/collective/partners-store'

/** One month of the shared partner calendar. The hub, its partners and every listing are re-read on
 *  every month, so a partner that left or a listing that was removed cannot survive in the feed. */
export async function loadPartnersMonth(slug: string, year: number, month1: number): Promise<CalendarEvent[]> {
  const month = safeMonth(year, month1)
  if (!month || typeof slug !== 'string' || !slug || slug.length > 253) return []
  const hub = await getVisibleSpaceBySlug(slug, await getMyProfileId())
  if (!hub || spacePlanTab(hub) !== 'partners') return []
  try {
    const view = await loadPartnersView(hub.id)
    if (!view) return []
    const window = monthGridWindow(month.year, month.month1)
    return await loadPartnersCalendarWindow(view, window.fromDay, window.toDay)
  } catch (error) {
    // SCAN-1000: an unreadable partners table leaves the month empty rather than throwing to the calendar.
    console.error('[partners] a calendar month could not be read', error)
    return []
  }
}
