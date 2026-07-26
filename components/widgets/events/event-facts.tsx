import { getEventContext } from '@/lib/events/active-event'

// RETIRED into the unified RSVP box (ADR-826): the when-line + online join link now lead the
// `event-join` card and the who's-coming pile lives there too, so this standalone block returns
// null everywhere — including event pages with a SAVED layout still listing `event-facts`, which
// double-rendered the date and "who's going" (owner report 2026-07-26). The module id stays
// registered so saved layouts keep resolving; it simply contributes nothing.
export const EventFacts = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return null
}
