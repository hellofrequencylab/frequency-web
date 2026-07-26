import { getEventContext } from '@/lib/events/active-event'

// RETIRED into the unified RSVP box (ADR-826): the who's-coming pile now renders INSIDE the
// `event-join` module, so this standalone block returns null everywhere — including event pages
// with a SAVED layout that still lists `event-warm-proof` (rendering both duplicated the
// "Be the first to RSVP" card, owner report 2026-07-26). The module id stays registered so saved
// layouts keep resolving; it simply contributes nothing.
export const EventWarmProof = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  return null
}
