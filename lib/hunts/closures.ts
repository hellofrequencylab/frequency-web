/**
 * Live closures (FH-030S): which placements of a published version cannot take a visit right now, and
 * whether a planned closure would leave players with no way to finish. Pure: no database, no Next.
 *
 * A published version never stores `closed`. It is live state, read fresh for each request:
 * - a placement that was revoked (hunt_placements.revoked_at) is closed;
 * - a venue whose partner row is not in force (withdrawn, suspended, expired, not yet effective) is
 *   closed, and so is every placement there. A venue with no partner row at all is the Space that runs
 *   the Hunt, or no venue, and stays open.
 * The claim path refuses both on its own (hunt_claim_apply, migration 20270346081000); this module is
 * what lets the player page and the organiser screens say so before anyone walks there.
 */
import { validateGraph } from './graph'
import { closeVenue } from './graph/count-rules'
import type { Blocker, HuntGraph } from './graph'
import type { PartnerRow } from './authz'
import { partnerLive } from './partners'

type PartnerState = Pick<PartnerRow, 'spaceId' | 'status' | 'effectiveAt' | 'revokedAt'>

/** What a player reads at a stop whose place is closed. Plain, and it says what still counts. */
export const CLOSED_STOP_MESSAGE = 'This place is closed for now, so this stop cannot be visited. Your other stops still count.'

/** Venues with a partner row and none of them in force at `now`. Sorted. */
export function closedVenues(partners: readonly PartnerState[], now: string): Set<string> {
  const live = new Set(partners.filter((p) => partnerLive(p, now)).map((p) => p.spaceId))
  return new Set(partners.map((p) => p.spaceId).filter((id) => !live.has(id)).sort())
}

/** The placements of a version that are closed now: revoked, or sitting at a closed venue. */
export function closedPlacements(
  bindings: readonly { placement_id: string; venue_space_id: string | null }[],
  revoked: ReadonlySet<string>,
  venues: ReadonlySet<string>,
): Set<string> {
  return new Set(bindings.filter((b) => revoked.has(b.placement_id) || (b.venue_space_id !== null && venues.has(b.venue_space_id))).map((b) => b.placement_id))
}

const blockerId = (b: Blocker) => `${b.code}:${[...b.mission_keys].sort().join(',')}`

/**
 * The blockers that closing `venue` would add to a live graph (which already carries today's closures).
 * Empty means players can still finish, in every region, without that venue. A planned closure that
 * returns any is refused before it goes live (lib/hunts/partner-store.ts `revokePartner`).
 */
export function closureBlockers(graph: HuntGraph, venue: string): Blocker[] {
  const before = new Set(validateGraph(graph).blockers.map(blockerId))
  return validateGraph(closeVenue(graph, venue)).blockers.filter((b) => !before.has(blockerId(b)))
}

/** Does every placement of this mission sit somewhere closed? A mission with no placement never is. */
export function placementsAllClosed(mission: HuntGraph['missions'][number]): boolean {
  const placements = Array.isArray(mission.placements) ? mission.placements : []
  return placements.length > 0 && placements.every((p) => p.closed === true)
}
