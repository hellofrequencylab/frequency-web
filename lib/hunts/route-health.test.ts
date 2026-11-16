// FH-032: route health. Done when: an organiser views route aggregates while a partner cannot
// reconstruct a participant's trail.
import { describe, expect, it } from 'vitest'
import type { PartnerRow } from './authz'
import { SMALL_CELL } from './merchant-report'
import { STALL_HOURS, activeVenues, buildRouteHealth, partnerRouteView, type RouteFacts } from './route-health'

const HUNT = 'hunt-1'
const OWNER_SPACE = 'space-owner'
const CAFE = 'space-cafe'
const BOOKS = 'space-books'
const GONE = 'space-gone'
const NOW = '2026-11-16T12:00:00Z'
const RECENT = '2026-11-16T10:00:00Z'
const OLD = '2026-11-14T10:00:00Z'

const partner = (spaceId: string, over: Partial<PartnerRow> = {}): PartnerRow => ({
  huntId: HUNT, spaceId, status: 'accepted', effectiveAt: '2026-11-01T00:00:00Z', revokedAt: null, permittedRoles: ['operator'], ...over,
})

/** One player's path: the stops credited, in order, with when the last one landed, and the run's state. */
type Path = { run: string; state: 'active' | 'completed' | 'withdrawn'; stops: ('a' | 'b' | 'c')[]; lastAt?: string; viaAlt?: boolean }

const PLACEMENT = { a: 'p-cafe', b: 'p-books', c: 'p-own' } as const

function facts(paths: Path[], over: Partial<RouteFacts> = {}): RouteFacts {
  const claims: RouteFacts['claims'][number][] = []
  const progress: RouteFacts['progress'][number][] = []
  for (const p of paths) {
    p.stops.forEach((stop, i) => {
      const placementId = stop === 'b' && p.viaAlt ? 'p-books-alt' : PLACEMENT[stop]
      claims.push({ runId: p.run, versionId: 'v1', missionKey: stop, state: 'accepted', assurance: 'signed_node', placementId, heldVenueSpaceId: null })
      const acceptedAt = i === p.stops.length - 1 ? p.lastAt ?? RECENT : '2026-11-13T09:00:00Z'
      progress.push({ runId: p.run, missionKey: stop, disposition: 'credited', acceptedAt })
    })
  }
  return {
    hunt: { status: 'live', ownerSpaceId: OWNER_SPACE, currentVersionId: 'v1' },
    partners: [partner(CAFE), partner(BOOKS), partner(GONE, { revokedAt: '2026-11-10T00:00:00Z' })],
    missions: [{ missionKey: 'a', title: 'The cafe' }, { missionKey: 'b', title: 'The bookshop' }, { missionKey: 'c', title: 'The square' }],
    versionRuns: paths.map((p) => ({ id: p.run, state: p.state })),
    runs: paths.map((p) => ({ id: p.run, state: p.state })),
    progress,
    claims,
    bindings: [
      { versionId: 'v1', missionKey: 'a', placementId: 'p-cafe', venueSpaceId: CAFE },
      { versionId: 'v1', missionKey: 'b', placementId: 'p-books', venueSpaceId: BOOKS },
      { versionId: 'v1', missionKey: 'b', placementId: 'p-books-alt', venueSpaceId: BOOKS },
      { versionId: 'v1', missionKey: 'c', placementId: 'p-own', venueSpaceId: OWNER_SPACE },
    ],
    placements: [
      { id: 'p-cafe', medium: 'qr', revokedAt: null, healthStatus: 'ok' },
      { id: 'p-books', medium: 'qr', revokedAt: null, healthStatus: 'damaged' },
      { id: 'p-books-alt', medium: 'staff', revokedAt: null, healthStatus: 'unchecked' },
      { id: 'p-own', medium: 'nfc', revokedAt: null, healthStatus: 'ok' },
      { id: 'p-old', medium: 'qr', revokedAt: '2026-11-05T00:00:00Z', healthStatus: 'missing' },
    ],
    rewards: [{ id: 'rw', title: 'Free coffee', kind: 'perk' }],
    grants: [{ rewardId: 'rw', state: 'redeemed', redeemedVenueSpaceId: CAFE }, { rewardId: 'rw', state: 'granted', redeemedVenueSpaceId: null }],
    outbox: { pending: 2, leased: 1, done: 40, dead: 3 },
    venueNames: { [OWNER_SPACE]: 'Town Hall', [CAFE]: 'Corner Cafe', [BOOKS]: 'Page One' },
    ...over,
  }
}

const base: Path[] = [
  { run: 'run-01', state: 'completed', stops: ['a', 'b', 'c'] },
  { run: 'run-02', state: 'completed', stops: ['a', 'b', 'c'], viaAlt: true },
  { run: 'run-03', state: 'active', stops: ['a', 'b'], viaAlt: true },
  { run: 'run-04', state: 'active', stops: ['a'], lastAt: OLD },
  { run: 'run-05', state: 'active', stops: ['a'], lastAt: OLD },
  { run: 'run-06', state: 'active', stops: ['a'] },
  { run: 'run-07', state: 'active', stops: [] },
  { run: 'run-08', state: 'withdrawn', stops: ['a'] },
]
/** One more player who has not started, so no Trail-wide count in the path test sits on a multiple of five. */
const offBoundary: Path[] = [...base, { run: 'run-09', state: 'active', stops: [] }]

describe('the organiser view', () => {
  const health = buildRouteHealth(facts(base), NOW)

  it('counts runs and shows where they wait and stall', () => {
    expect(STALL_HOURS).toBe(24)
    expect(health.status).toBe('live')
    expect(health.runs).toEqual({ started: 8, playing: 5, finished: 2, stopped: 1, notStarted: 1 })
    expect(health.stops.map((s) => [s.title, s.reached, s.waiting, s.stalled])).toEqual([
      ['The cafe', 7, 3, 2],
      ['The bookshop', 3, 1, 0],
      ['The square', 2, 0, 0],
    ])
    // Everyone playing is either waiting after a stop or has not started.
    expect(health.stops.reduce((a, s) => a + s.waiting, 0) + health.runs.notStarted).toBe(health.runs.playing)
  })

  it('shows how alternates are used, and uses add up to the stop', () => {
    const books = health.stops[1]
    expect(books.placements).toEqual([
      { medium: 'qr', open: true, venueSpaceId: BOOKS, uses: 1 },
      { medium: 'staff', open: true, venueSpaceId: BOOKS, uses: 2 },
    ])
    for (const s of health.stops) expect(s.placements.reduce((a, p) => a + p.uses, 0)).toBe(s.reached)
  })

  it('counts open and closed placements and the open ones that need a look', () => {
    expect(health.placements).toEqual({ open: 4, closed: 1, damaged: 1, missing: 0, unchecked: 1 })
  })

  it('lists metrics for active venues only: a revoked partner drops out (the FH-029 seam)', () => {
    expect(activeVenues(facts(base), NOW)).toEqual([OWNER_SPACE, CAFE, BOOKS])
    expect(activeVenues(facts(base, { partners: [partner(CAFE, { status: 'invited' }), partner(BOOKS, { effectiveAt: '2026-12-01T00:00:00Z' })] }), NOW)).toEqual([OWNER_SPACE])
    expect(health.venues).toEqual([
      { spaceId: OWNER_SPACE, name: 'Town Hall', confirmedStops: 2, players: 2, awaitingReview: 0, handedOver: 0 },
      { spaceId: CAFE, name: 'Corner Cafe', confirmedStops: 7, players: 7, awaitingReview: 0, handedOver: 1 },
      { spaceId: BOOKS, name: 'Page One', confirmedStops: 3, players: 3, awaitingReview: 0, handedOver: 0 },
    ])
  })

  it('reports whether the Trail\'s messages are going out', () => {
    expect(health.messages).toEqual({ waiting: 2, sending: 1, sent: 40, failed: 3 })
  })

  it('is an aggregate: no run and no timestamp survives', () => {
    const text = JSON.stringify(health)
    expect(text).not.toMatch(/run-\d\d/)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })
})

describe('the partner view', () => {
  it('shows a venue its own placements and stops exactly, and nothing about another venue', () => {
    const view = partnerRouteView(facts(base), CAFE, NOW)
    expect(view.placements).toEqual({ open: 1, closed: 0 })
    expect(view.stops).toEqual([{ title: 'The cafe', confirmedHere: 7, waiting: null }])
    expect(view.runs).toEqual({ started: 5, playing: 5, finished: null })
    const text = JSON.stringify(view)
    expect(text).not.toMatch(/run-\d\d|space-|bookshop|square|Page One|Town Hall|p-books|p-own|\d{4}-\d{2}-\d{2}T/)
    expect(Object.keys(view).sort()).toEqual(['placements', 'runs', 'status', 'stops'])
  })

  it('cannot tell one player\'s onward path from another', () => {
    // After the cafe, the same player might stop, reach the bookshop either way, finish, or quit.
    // Everything else is held still. The cafe sees the same view in every case.
    const others = offBoundary.filter((p) => p.run !== 'run-06')
    const variants: Path[] = [
      { run: 'run-06', state: 'active', stops: ['a'] },
      { run: 'run-06', state: 'active', stops: ['a'], lastAt: OLD },
      { run: 'run-06', state: 'active', stops: ['a', 'b'] },
      { run: 'run-06', state: 'active', stops: ['a', 'b'], viaAlt: true },
      { run: 'run-06', state: 'completed', stops: ['a', 'b', 'c'] },
      { run: 'run-06', state: 'withdrawn', stops: ['a', 'b'] },
    ]
    const views = variants.map((v) => JSON.stringify(partnerRouteView(facts([...others, v]), CAFE, NOW)))
    expect(new Set(views).size).toBe(1)
    // The organiser, who may see aggregates, does see the difference.
    expect(new Set(variants.map((v) => JSON.stringify(buildRouteHealth(facts([...others, v]), NOW)))).size).toBeGreaterThan(1)
  })

  it('at a multiple of five a change shows as one whole step and names no one', () => {
    // Exactly five are playing. When any one of them finishes, the cafe sees the same step whoever it was.
    const before = partnerRouteView(facts(base), CAFE, NOW)
    expect(before.runs.playing).toBe(5)
    const after = ['run-03', 'run-04', 'run-05', 'run-06', 'run-07'].map((who) =>
      JSON.stringify(partnerRouteView(facts(base.map((p) => (p.run === who ? { ...p, state: 'completed' as const } : p))), CAFE, NOW)),
    )
    expect(new Set(after).size).toBe(1)
    expect(JSON.parse(after[0]).runs.playing).toBeNull()
  })

  it('moves every cross-venue number only in steps of the small-cell floor, at any size', () => {
    const paths: Path[] = []
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      // Each new player visits the cafe, then goes on in a rotating way.
      const onward = ([[], ['b'], ['b', 'c']] as const)[i % 3]
      paths.push({ run: `run-${String(i).padStart(2, '0')}x`, state: onward.length === 2 ? 'completed' : 'active', stops: ['a', ...onward] })
      const view = partnerRouteView(facts(paths), CAFE, NOW)
      for (const n of [view.runs.started, view.runs.playing, view.runs.finished, ...view.stops.map((s) => s.waiting)]) {
        expect(n === null || (n >= SMALL_CELL && n % SMALL_CELL === 0)).toBe(true)
      }
      // The venue's own count is exact: it saw each of these players at its own counter.
      expect(view.stops[0].confirmedHere).toBe(i + 1)
      seen.add(JSON.stringify(view.runs))
    }
    // Forty arrivals, and the Trail-wide numbers changed far fewer times than forty.
    expect(seen.size).toBeLessThanOrEqual(40 / SMALL_CELL + 6)
  })

  it('gives a venue with no placement on the Trail nothing but coarse totals', () => {
    const view = partnerRouteView(facts(base), 'space-elsewhere', NOW)
    expect(view.stops).toEqual([])
    expect(view.placements).toEqual({ open: 0, closed: 0 })
  })
})
