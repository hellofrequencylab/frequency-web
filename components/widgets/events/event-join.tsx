import { getEventContext } from '@/lib/events/active-event'

// The movable JOIN block (the `event-join` layout module): the RSVP / ticket action box an operator
// places anywhere on the event detail page via the Layout editor. A zero-prop self-fetching RSC that
// reads the request-scoped event context (lib/events/active-event.ts) — no props, no re-fetch.
//
// The box itself (priced-ticket card, RSVP controls, check-in, waitlist) is fully built AND gated by
// the detail page (it depends on the ticketing / capacity / viewer locals the page already resolved),
// then stamped into the context as `joinActions`. The page sets it to null on a cancelled event, so
// this module renders nothing there — preserving the "join hidden when cancelled" gate exactly.
export const EventJoin = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  if (!ctx.joinActions) return null
  return <>{ctx.joinActions}</>
}
