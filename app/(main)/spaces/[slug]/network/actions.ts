'use server'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { monthGridWindow, safeMonth } from '@/lib/calendar/month-window'
import type { CalendarEvent } from '@/lib/calendar/item'
import { collectiveNetworkOpen } from '@/lib/collective/network'
import { loadCollectiveNetworkWindow } from '@/lib/collective/network-store'

/** Read one public month. Resolve the parent for this caller on EVERY request, and re-read child
 * eligibility on EVERY month: a former member/private/suspended child cannot survive in the feed. */
export async function loadCollectiveNetworkMonth(slug: string, year: number, month1: number): Promise<CalendarEvent[]> {
  const month = safeMonth(year, month1)
  if (!month || typeof slug !== 'string' || !slug || slug.length > 253) return []
  const parent = await getVisibleSpaceBySlug(slug, await getMyProfileId())
  if (!parent || !collectiveNetworkOpen(parent)) return []
  const window = monthGridWindow(month.year, month.month1)
  return loadCollectiveNetworkWindow(parent, parent.brandName?.trim() || parent.name, window.fromDay, window.toDay)
}
