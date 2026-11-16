// FH-032S: route health reads live partner state (lib/hunts/partners.ts) and the finale every player
// sees (lib/hunts/rally-finale.ts). Done when: a venue withdrawn through the partner flow leaves the
// organiser's active venue list on the next read while its past counts still reconcile, and the
// organiser sees whether the finale went out.
import { describe, expect, it } from 'vitest'
import { PARTNER_TERMS } from './partners'
import type { HostEvent } from './rally-finale'
import { activeVenues, buildRouteHealth, partnerRouteView, type RouteFacts, type RoutePartner } from './route-health'

const HUNT = 'hunt-1'
const OWN = 'space-own'
const CAFE = 'space-cafe'
const BOOKS = 'space-books'
const NOW = '2026-11-16T12:00:00Z'
const EVENT = '11111111-1111-4111-8111-111111111111'

const partner = (spaceId: string, over: Partial<RoutePartner> = {}): RoutePartner => ({
  huntId: HUNT,
  spaceId,
  status: 'accepted',
  effectiveAt: '2026-11-01T00:00:00Z',
  revokedAt: null,
  permittedRoles: ['operator'],
  inviteeProfileId: `steward-${spaceId}`,
  termsVersion: PARTNER_TERMS.hash,
  ...over,
})

const hostEvent = (over: Partial<HostEvent> = {}): HostEvent => ({
  id: EVENT, title: 'Rally night', slug: 'rally-night', startsAt: '2026-11-20T19:00:00Z', capacity: 40, cancelled: false, published: true, hostSpaceId: OWN, ...over,
})

/** Three players: two confirmed the cafe stop, all three the bookshop, one finished at the square. */
function facts(over: Partial<RouteFacts> = {}): RouteFacts {
  const visits: [string, 'a' | 'b' | 'c', string][] = [
    ['r1', 'a', 'p-cafe'], ['r1', 'b', 'p-books'], ['r1', 'c', 'p-own'],
    ['r2', 'a', 'p-cafe'], ['r2', 'b', 'p-books'],
    ['r3', 'b', 'p-books'],
  ]
  return {
    hunt: { status: 'live', ownerSpaceId: OWN, currentVersionId: 'v1' },
    partners: [partner(CAFE), partner(BOOKS)],
    stewardNames: { [`steward-${CAFE}`]: 'Ana', [`steward-${BOOKS}`]: 'Ben' },
    missions: [{ missionKey: 'a', title: 'The cafe' }, { missionKey: 'b', title: 'The bookshop' }, { missionKey: 'c', title: 'The square' }],
    versionRuns: [{ id: 'r1', state: 'completed' }, { id: 'r2', state: 'active' }, { id: 'r3', state: 'active' }],
    runs: [{ id: 'r1', state: 'completed' }, { id: 'r2', state: 'active' }, { id: 'r3', state: 'active' }],
    progress: visits.map(([runId, missionKey]) => ({ runId, missionKey, disposition: 'credited', acceptedAt: '2026-11-15T10:00:00Z' })),
    claims: visits.map(([runId, missionKey, placementId]) => ({ runId, versionId: 'v1', missionKey, state: 'accepted', assurance: 'signed_node', placementId, heldVenueSpaceId: null })),
    bindings: [
      { versionId: 'v1', missionKey: 'a', placementId: 'p-cafe', venueSpaceId: CAFE },
      { versionId: 'v1', missionKey: 'b', placementId: 'p-books', venueSpaceId: BOOKS },
      { versionId: 'v1', missionKey: 'c', placementId: 'p-own', venueSpaceId: OWN },
    ],
    placements: [
      { id: 'p-cafe', medium: 'qr', revokedAt: null, healthStatus: 'ok' },
      { id: 'p-books', medium: 'qr', revokedAt: null, healthStatus: 'ok' },
      { id: 'p-own', medium: 'nfc', revokedAt: null, healthStatus: 'ok' },
    ],
    rewards: [{ id: 'rw', title: 'Free coffee', kind: 'perk' }],
    grants: [{ rewardId: 'rw', state: 'redeemed', redeemedVenueSpaceId: CAFE }],
    outbox: { pending: 0, leased: 0, done: 5, dead: 0 },
    venueNames: { [OWN]: 'Town Hall', [CAFE]: 'Corner Cafe', [BOOKS]: 'Page One' },
    ...over,
  }
}

const confirmed = (h: ReturnType<typeof buildRouteHealth>) => [...h.venues, ...h.formerVenues].reduce((a, v) => a + v.confirmedStops, 0)

describe('live partner state', () => {
  const before = buildRouteHealth(facts(), NOW)

  it('lists each live partner with its named steward and whether its terms are today\'s', () => {
    expect(before.venues.map((v) => v.spaceId)).toEqual([OWN, CAFE, BOOKS])
    expect(before.formerVenues).toEqual([])
    expect(before.partnerStanding).toEqual([
      { spaceId: CAFE, steward: 'Ana', terms: 'current' },
      { spaceId: BOOKS, steward: 'Ben', terms: 'current' },
    ])
    const older = buildRouteHealth(facts({ partners: [partner(CAFE, { termsVersion: 'an-older-hash' }), partner(BOOKS, { termsVersion: null, inviteeProfileId: null })] }), NOW)
    expect(older.partnerStanding).toEqual([
      { spaceId: CAFE, steward: 'Ana', terms: 'earlier' },
      { spaceId: BOOKS, steward: null, terms: 'unknown' },
    ])
  })

  it('a withdrawn venue leaves the active list on the next read and keeps its past counts', () => {
    const after = buildRouteHealth(facts({ partners: [partner(CAFE, { status: 'withdrawn' }), partner(BOOKS)] }), NOW)
    expect(after.venues.map((v) => v.spaceId)).toEqual([OWN, BOOKS])
    expect(after.partnerStanding.map((p) => p.spaceId)).toEqual([BOOKS])
    const cafeBefore = before.venues.find((v) => v.spaceId === CAFE)
    expect(after.formerVenues).toEqual([{ ...cafeBefore, ended: 'withdrawn' }])
    expect(after.formerVenues[0]).toMatchObject({ confirmedStops: 2, players: 2, handedOver: 1 })
    // Nothing earned is lost: the venue totals still add up to the same confirmed stops.
    expect(confirmed(after)).toBe(confirmed(before))
    expect(after.stops).toEqual(before.stops)
  })

  it('a suspended or revoked partner is former too; one that never went live is neither', () => {
    const suspended = buildRouteHealth(facts({ partners: [partner(CAFE, { status: 'suspended' }), partner(BOOKS, { revokedAt: '2026-11-10T00:00:00Z' })] }), NOW)
    expect(suspended.venues.map((v) => v.spaceId)).toEqual([OWN])
    expect(suspended.formerVenues.map((v) => [v.spaceId, v.ended])).toEqual([[CAFE, 'suspended'], [BOOKS, 'ended']])
    expect(confirmed(suspended)).toBe(confirmed(before))

    const neverLive = facts({ partners: [partner(CAFE, { status: 'invited', effectiveAt: null }), partner(BOOKS, { status: 'declined', effectiveAt: null })] })
    expect(activeVenues(neverLive, NOW)).toEqual([OWN])
    expect(buildRouteHealth(neverLive, NOW).formerVenues).toEqual([])
  })

  it('a venue\'s own view is unchanged in shape by any of this', () => {
    const view = partnerRouteView(facts({ partners: [partner(CAFE, { status: 'withdrawn' }), partner(BOOKS)] }), BOOKS, NOW)
    expect(Object.keys(view).sort()).toEqual(['placements', 'runs', 'status', 'stops'])
  })
})

describe('the finale every player sees', () => {
  it('says so when the Trail does not end at an event', () => {
    expect(buildRouteHealth(facts(), NOW).finale).toEqual({ state: 'none' })
    expect(buildRouteHealth(facts({ finale: null }), NOW).finale).toEqual({ state: 'none' })
  })

  it('shows the host Event and how full it is, with no player in it', () => {
    const h = buildRouteHealth(facts({ finale: { eventId: EVENT, event: hostEvent(), going: 12 } }), NOW)
    expect(h.finale).toEqual({
      state: 'showing',
      event: { title: 'Rally night', slug: 'rally-night', startsAt: '2026-11-20T19:00:00Z' },
      capacity: 40,
      going: 12,
      spotsLeft: 28,
      isFull: false,
    })
    const full = buildRouteHealth(facts({ finale: { eventId: EVENT, event: hostEvent(), going: 40 } }), NOW).finale
    expect(full).toMatchObject({ state: 'showing', spotsLeft: 0, isFull: true })
  })

  it('reads as unavailable when the Event is cancelled, missing, or its host partner withdrew', () => {
    const unavailable = (over: Partial<RouteFacts>) => buildRouteHealth(facts(over), NOW).finale
    expect(unavailable({ finale: { eventId: EVENT, event: hostEvent({ cancelled: true }), going: 0 } })).toEqual({ state: 'unavailable' })
    expect(unavailable({ finale: { eventId: EVENT, event: null, going: 0 } })).toEqual({ state: 'unavailable' })
    const atCafe = { eventId: EVENT, event: hostEvent({ hostSpaceId: CAFE }), going: 3 }
    expect(unavailable({ finale: atCafe })).toMatchObject({ state: 'showing' })
    expect(unavailable({ finale: atCafe, partners: [partner(CAFE, { status: 'withdrawn' }), partner(BOOKS)] })).toEqual({ state: 'unavailable' })
  })

  it('never puts the finale in a venue\'s view', () => {
    const view = partnerRouteView(facts({ finale: { eventId: EVENT, event: hostEvent(), going: 12 } }), CAFE, NOW)
    expect(view).not.toHaveProperty('finale')
  })
})
