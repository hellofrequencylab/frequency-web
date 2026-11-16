/**
 * The author's half of the Rally finale (FH-031S). Pure: no database, no Next, no network.
 *
 * A resident may end a Trail at ONE host Event. The choice lives on the draft as `finaleEventId`, and
 * publish freezes it on the version as `hunt_versions.policy.finale.event_id`, which is the only place
 * the player's read model looks (lib/hunts/rally-finale.ts `parseFinale`). Choosing an Event gives the
 * Trail nothing at that Event: no seat, no ticket, no RSVP. The Event keeps admission.
 *
 * Which Events may be chosen (`finaleEventAllowed`): one that is published, not cancelled and not
 * removed, and hosted by the Hunt's own Space or by a Space that is a live partner on the Hunt. A Hunt
 * a resident owns without a Space has no Space of its own, so there its own Events are the ones the
 * owner hosts in their own name. Publish asks again, so a choice that stopped being true blocks.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The draft field, read off untrusted input. Absent unless it is an id, so older drafts read back unchanged. */
export function finaleDraftField(value: unknown): { finaleEventId?: string } {
  return typeof value === 'string' && UUID.test(value) ? { finaleEventId: value.toLowerCase() } : {}
}

/** The part of the published content hash a finale adds. Empty with no finale, so those Trails hash as before. */
export function finaleContent(eventId: string | undefined): { finale?: { event_id: string } } {
  return eventId ? { finale: { event_id: eventId } } : {}
}

/** Write the finale onto the policy a version freezes, or clear it when the draft names none. */
export function applyFinalePolicy(policy: Record<string, unknown>, eventId: string | undefined): void {
  if (eventId) policy.finale = { event_id: eventId }
  else delete policy.finale
}

export type FinaleEventFacts = {
  status: string | null
  cancelled: boolean
  removed: boolean
  /** The Space that hosts the Event, or null for a member's own Event. */
  hostSpaceId: string | null
  /** The member who hosts it. */
  hostProfileId: string | null
}

export type FinaleHunt = { ownerSpaceId: string | null; ownerProfileId: string | null; livePartnerSpaceIds: readonly string[] }

/** May this Hunt end at this Event? The one rule the picker and publish both ask. */
export function finaleEventAllowed(event: FinaleEventFacts | null, hunt: FinaleHunt): boolean {
  if (!event || event.status !== 'published' || event.cancelled || event.removed) return false
  if (event.hostSpaceId) return event.hostSpaceId === hunt.ownerSpaceId || hunt.livePartnerSpaceIds.includes(event.hostSpaceId)
  // A member's own Event belongs to a Hunt only when that Hunt is the same member's and has no Space.
  return !hunt.ownerSpaceId && !!hunt.ownerProfileId && event.hostProfileId === hunt.ownerProfileId
}

/** What publish says when the chosen Event is no longer one this Trail may end at. */
export const FINALE_BLOCK_ITEM = {
  code: 'finale_event',
  ok: false,
  message: 'The finale event is not one this trail can end at any more. Pick another event, or clear the finale.',
} as const

/** A completion reward waits on the finale; a reward for named stops does not. The same split the database makes. */
export function isCompletionReward(eligibility: unknown): boolean {
  const missions = eligibility && typeof eligibility === 'object' ? (eligibility as { missions?: unknown }).missions : undefined
  return !Array.isArray(missions)
}
