import { eventsQuery } from '@/lib/contract'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toEventView } from '@/lib/contract/views'
import { getPublicEventBySlug, getPublicEvents } from '@/lib/discover'

// GET /api/v1/events (LIVE-716): upcoming public events, one per series, the same public_events
// read the events index uses. `?slug=` answers one event (`{ data: EventView }`) instead.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'events')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const { slug } = readInput(eventsQuery, Object.fromEntries(new URL(request.url).searchParams))
    if (slug) {
      const event = await getPublicEventBySlug(slug)
      return event ? ok(toEventView(event)) : fail('not_found', 'That event could not be found.')
    }
    const events = await getPublicEvents(50)
    return ok({ items: events.map(toEventView), nextCursor: null })
  } catch (e) {
    return failFrom(e)
  }
}
