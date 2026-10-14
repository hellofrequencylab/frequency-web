import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import { seriesUpcomingFloor } from '@/lib/events/series'
import {
  circleEventScopeFilter,
  circleEventVisibilities,
  selectUpcomingForCircle,
  type CircleEventRow,
  type CircleUpcomingEvent,
} from '@/lib/events/circle-upcoming'
import { meetupWhen } from './meetup-when'

// THE NEXT MEETUP OF EACH OF THE VIEWER'S OWN CIRCLES (the Circles index, templates/members/Circles.html:
// every "Your Circles" card reads "Next: Fri 6:15am"). The viewer is a member of every id passed, so the
// members-only (`circle_only`) events count, exactly as the Circle's own What's Happening tab lists them
// for an insider. The selection rules are the Circle page's own (lib/events/circle-upcoming.ts): the
// same scope filter, the same JS re-check, the same midnight-today floor in the community's zone.
//
// Arms 1 and 2 only. A Space Circle's third arm (its Space's whole calendar) needs the Space row, which
// the index card does not carry; that Circle's card simply shows no Next line rather than a wrong one.
//
// FAIL-SAFE: a read that throws drops that card's line. The index never breaks over a teaser.

/** How many of the viewer's Circles get a Next line (one small read each, in parallel). */
export const NEXT_MEETUP_CIRCLES = 12

export async function loadNextMeetups(circleIds: string[], now: Date = new Date()): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = circleIds.slice(0, NEXT_MEETUP_CIRCLES)
  if (ids.length === 0) return out
  const floor = seriesUpcomingFloor(dayInZone(now, HOME_TZ))
  const admin = createAdminClient()
  const found = await Promise.all(
    ids.map(async (id): Promise<[string, CircleUpcomingEvent | null]> => {
      const filter = circleEventScopeFilter(id)
      if (!filter) return [id, null]
      try {
        const { data } = await admin
          .from('events')
          .select('id, title, slug, location, starts_at, scope_id, scope_type, scope_circle_id')
          .or(filter)
          .eq('status', 'published')
          .eq('is_cancelled', false)
          .is('removed_at', null)
          .in('visibility', circleEventVisibilities(true))
          .gte('starts_at', floor)
          .order('starts_at', { ascending: true })
          .limit(5)
        const rows = (data ?? []) as unknown as CircleEventRow[]
        return [id, selectUpcomingForCircle(rows, id, new Date(floor), 1).events[0] ?? null]
      } catch {
        return [id, null]
      }
    }),
  )
  for (const [id, e] of found) if (e) out.set(id, meetupWhen(e.starts_at, now))
  return out
}
