// FH-030S: a Passport (any N of M stops) with regions, authored as a draft, published as count rules, and
// checked against live closures: at publish, before a planned closure, and on the player's page.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeHuntAction: vi.fn(),
  loadVersionGraph: vi.fn(),
  partner: { status: 'accepted' } as Record<string, unknown>,
  updates: [] as unknown[],
  tables: {} as Record<string, Record<string, unknown>[]>,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let rows = mocks.tables[table] ?? []
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, count: rows.length, error: null }).then(res),
      }
      return q
    },
  }),
}))
vi.mock('./store', () => ({ authorizeHuntAction: mocks.authorizeHuntAction }))
vi.mock('./run-store', async (actual) => ({ ...(await actual<typeof import('./run-store')>()), loadVersionGraph: mocks.loadVersionGraph }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: vi.fn(), getSpaceBySlug: vi.fn() }))
vi.mock('@/lib/spaces/membership', () => ({ getSpaceMembership: vi.fn() }))
vi.mock('./commerce-store', () => ({
  db: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { hunt_id: 'h1', space_id: CAFE, effective_at: null, revoked_at: null, permitted_roles: [], invitee_profile_id: null, terms_version: null, ...mocks.partner }, error: null }),
        update: (patch: unknown) => (mocks.updates.push(patch), q),
        insert: async () => ({ error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [{ space_id: CAFE }], error: null }).then(res),
      }
      return q
    },
  }),
}))

import { closedPlacements, closedVenues, closureBlockers, CLOSED_STOP_MESSAGE } from './closures'
import { canonicalContent, draftToGraph, parseTrailDraft, publishChecklist, publishedPolicy, publishRows, remapRegions, routeGraph } from './draft'
import { evaluate, validateGraph } from './graph'
import { revokePartner } from './partner-store'
import { projectForPlayer } from './player'
import { assembleTrail, loadPublishedTrail } from './run-store'

const CAFE = '00000000-0000-4000-a030-0000000000c1'
const BOOKS = '00000000-0000-4000-a030-0000000000b2'
const stop = (n: number) => ({ place: `Place ${n}`, clue: `Clue ${n}`, placementReady: true })
const passport = (over: Record<string, unknown> = {}) => parseTrailDraft({
  title: 'Harbor passport', stops: [1, 2, 3, 4, 5].map(stop), routeTestedAtRevision: 2, permissionConfirmed: true, finishCount: 3, ...over,
})
const NOW = '2026-11-18T12:00:00Z'

describe('a resident-built Passport with a 3 of 5 threshold', () => {
  it('passes the publish checklist, venue aware, and publishes a count finish with min_count', () => {
    const d = passport()
    expect(publishChecklist(d, 2, { route: { ownerVenue: null } }).ok).toBe(true)
    const finish = publishRows(d).groups
    expect(finish).toEqual([{ key: 'finish', target_mission_key: null, target_finish: true, logic: 'count', min_count: 3, members: ['stop-1', 'stop-2', 'stop-3', 'stop-4', 'stop-5'] }])
    expect(evaluate(draftToGraph(d), ['stop-5', 'stop-1', 'stop-3'].map((mission_key) => ({ mission_key })), NOW).finished).toBe(true)
    expect(evaluate(draftToGraph(d), ['stop-5', 'stop-1'].map((mission_key) => ({ mission_key })), NOW).finished).toBe(false)
  })

  it('refuses a threshold players cannot reach, in plain words', () => {
    const item = publishChecklist(passport({ finishCount: 6 }), 2).items.find((i) => i.code === 'graph')
    expect(item).toMatchObject({ ok: false })
    expect(item?.message).toMatch(/^The Passport asks for more stops than players can reach/)
  })

  it('counts two stops at one venue once, and refuses when the Space that runs it is the only venue', () => {
    const d = passport({ venues: [{ stop: 0, venueSpaceId: CAFE }, { stop: 1, venueSpaceId: CAFE }, { stop: 2, venueSpaceId: CAFE }] })
    expect(publishChecklist(d, 2, { route: { ownerVenue: null } }).ok).toBe(true)
    expect(publishChecklist(passport({ finishCount: 4, venues: d.venues }), 2, { route: { ownerVenue: null } }).ok).toBe(false)
    expect(publishChecklist(passport(), 2, { route: { ownerVenue: 'the-space' } }).ok).toBe(false)
  })

  it('leaves a Trail in order exactly as it was', () => {
    const trail = parseTrailDraft({ title: 'Walk', stops: [1, 2, 3].map(stop), regions: [{ name: 'North', enabled: true, stops: [0] }] })
    expect(trail).not.toHaveProperty('finishCount')
    expect(publishRows(trail).groups.every((g) => g.logic === 'all' && !('min_count' in g))).toBe(true)
    expect(canonicalContent(trail)).toBe(canonicalContent({ ...trail, regions: undefined }))
    expect(publishedPolicy({ chapters: [{ chapter_key: 'old', enabled: true, members: [] }] }, trail)).not.toHaveProperty('chapters')
  })
})

describe('regions', () => {
  const regions = [{ name: 'North', enabled: true, stops: ['0', 1, 2] }, { name: 'South', enabled: true, stops: [2, 3, 4, 9] }]

  it('keeps each stop in one region and publishes them as chapters', () => {
    const d = passport({ finishCount: 2, regions })
    expect(d.regions).toEqual([{ name: 'North', enabled: true, stops: [0, 1, 2] }, { name: 'South', enabled: true, stops: [3, 4] }])
    expect(publishedPolicy(null, d).chapters).toEqual([
      { chapter_key: 'region-1', enabled: true, members: ['stop-1', 'stop-2', 'stop-3'] },
      { chapter_key: 'region-2', enabled: true, members: ['stop-4', 'stop-5'] },
    ])
    expect(publishChecklist(d, 2).ok).toBe(true)
    expect(remapRegions(d.regions ?? [], [4, 3, 2, 1])).toEqual([{ name: 'North', enabled: true, stops: [2, 3] }, { name: 'South', enabled: true, stops: [0, 1] }])
  })

  it('refuses a region whose players could not finish, naming the region', () => {
    const item = publishChecklist(passport({ finishCount: 3, regions }), 2).items.find((i) => i.code === 'graph')
    expect(item?.ok).toBe(false)
    expect(item?.message).toBe('South: players who stay in this region could not finish. Add stops to it, lower the number of stops needed, or turn the region off.')
  })
})

describe('live closures', () => {
  const partner = (spaceId: string, status: 'accepted' | 'withdrawn' | 'suspended') => ({ spaceId, status, effectiveAt: '2026-11-01T00:00:00Z', revokedAt: status === 'accepted' ? null : '2026-11-10T00:00:00Z' })

  it('closes a revoked placement and every placement at a venue whose partner left', () => {
    const venues = closedVenues([partner(CAFE, 'withdrawn'), partner(BOOKS, 'accepted')], NOW)
    expect([...venues]).toEqual([CAFE])
    const bindings = [{ placement_id: 'p1', venue_space_id: CAFE }, { placement_id: 'p2', venue_space_id: BOOKS }, { placement_id: 'p3', venue_space_id: null }]
    expect([...closedPlacements(bindings, new Set(['p3']), venues)].sort()).toEqual(['p1', 'p3'])
  })

  it('refuses at publish a route that only works through a closed venue', () => {
    const d = passport({ finishCount: 2, regions: [{ name: 'North', enabled: true, stops: [0, 1] }], venues: [{ stop: 0, venueSpaceId: CAFE }, { stop: 1, venueSpaceId: BOOKS }] })
    expect(publishChecklist(d, 2, { route: { ownerVenue: null } }).ok).toBe(true)
    expect(publishChecklist(d, 2, { route: { ownerVenue: null, closedVenues: new Set([CAFE]) } }).ok).toBe(true)
    const tight = passport({ finishCount: 2, stops: [1, 2, 3, 4].map(stop), regions: [{ name: 'North', enabled: true, stops: [0, 1] }, { name: 'South', enabled: true, stops: [2, 3] }], venues: [{ stop: 0, venueSpaceId: CAFE }, { stop: 1, venueSpaceId: BOOKS }] })
    expect(publishChecklist(tight, 2, { route: { ownerVenue: null } }).ok).toBe(true)
    expect(publishChecklist(tight, 2, { route: { ownerVenue: null, closedVenues: new Set([CAFE]) } }).items.find((i) => i.code === 'graph')?.message).toMatch(/^North: players who stay in this region could not finish/)
  })

  it('finds the planned closure that breaks a region, and lets a harmless one through', () => {
    const d = passport({ finishCount: 2, stops: [1, 2, 3, 4].map(stop), regions: [{ name: 'North', enabled: true, stops: [0, 1] }, { name: 'South', enabled: true, stops: [2, 3] }], venues: [{ stop: 0, venueSpaceId: CAFE }, { stop: 1, venueSpaceId: BOOKS }] })
    const live = routeGraph(d, [], { ownerVenue: null })
    expect(validateGraph(live).ok).toBe(true)
    expect(closureBlockers(live, CAFE).map((b) => b.code)).toContain('CHAPTER_INFEASIBLE')
    const roomy = routeGraph(passport({ finishCount: 2, venues: [{ stop: 0, venueSpaceId: CAFE }] }), [], { ownerVenue: null })
    expect(closureBlockers(roomy, CAFE)).toEqual([])
  })

  it('shows a player a closed stop as closed, and the stop still open elsewhere as open', () => {
    const missions = [1, 2, 3].map((n) => ({ mission_key: `stop-${n}`, title: `Place ${n}`, visible_body: `Clue ${n}`, locked_teaser: null, opens_at: null, closes_at: null }))
    const groups = [{ id: 'g', target_mission_key: null, target_finish: true, logic: 'count' as const, min_count: 2, group_key: 'finish' }]
    const members = missions.map((m) => ({ group_id: 'g', member_mission_key: m.mission_key }))
    const placements = [
      { mission_key: 'stop-1', placement_id: 'p1', venue_space_id: CAFE },
      { mission_key: 'stop-2', placement_id: 'p2', venue_space_id: BOOKS },
      { mission_key: 'stop-2', placement_id: 'p2b', venue_space_id: CAFE },
      { mission_key: 'stop-3', placement_id: 'p3', venue_space_id: null },
    ]
    const { graph, content } = assembleTrail(missions, groups, members, { placements, closed: closedPlacements(placements, new Set(), new Set([CAFE])) })
    expect(graph.missions[0].placements).toEqual([{ placement_key: 'p1', venue: CAFE, closed: true }])
    const view = projectForPlayer({ graph, content, credits: [], now: NOW, huntState: 'published', revision: 1 })
    expect(view.stops.map((s) => [s.key, s.state, s.placeClosed ?? false])).toEqual([['stop-1', 'closed', true], ['stop-2', 'eligible', false], ['stop-3', 'eligible', false]])
    expect(CLOSED_STOP_MESSAGE).not.toMatch(/—/)
  })
})

describe('the player page reads live closures', () => {
  it('marks the placements at a venue that withdrew as closed, only when asked', async () => {
    mocks.tables = {
      hunts: [{ id: 'h1', slug: 'harbor', visibility: 'public', status: 'live', current_version_id: 'v1', revision: 3 }],
      hunt_versions: [{ id: 'v1', hunt_id: 'h1', status: 'published', trail_title: 'Harbor passport', trail_hook: null, chapters: null }],
      hunt_missions: [1, 2].map((n) => ({ version_id: 'v1', mission_key: `stop-${n}`, title: `Place ${n}`, visible_body: `Clue ${n}`, locked_teaser: null, opens_at: null, closes_at: null })),
      hunt_rule_groups: [{ version_id: 'v1', id: 'g', target_mission_key: null, target_finish: true, logic: 'count', min_count: 1, group_key: 'finish' }],
      hunt_rule_group_members: [1, 2].map((n) => ({ version_id: 'v1', group_id: 'g', member_mission_key: `stop-${n}` })),
      hunt_mission_placements: [{ version_id: 'v1', mission_key: 'stop-1', placement_id: 'p1', venue_space_id: CAFE }, { version_id: 'v1', mission_key: 'stop-2', placement_id: 'p2', venue_space_id: null }],
      hunt_placements: [{ hunt_id: 'h1', id: 'p1', revoked_at: null }, { hunt_id: 'h1', id: 'p2', revoked_at: null }],
      hunt_partners: [{ hunt_id: 'h1', space_id: CAFE, status: 'withdrawn', effective_at: '2026-11-01T00:00:00Z', revoked_at: '2026-11-10T00:00:00Z' }],
    }
    const live = await loadPublishedTrail('harbor', { liveClosures: true })
    expect(live?.graph.missions.map((m) => m.placements)).toEqual([[{ placement_key: 'p1', venue: CAFE, closed: true }], [{ placement_key: 'p2', venue: null }]])
    const plain = await loadPublishedTrail('harbor')
    expect(plain?.graph.missions[0].placements).toEqual([{ placement_key: 'p1', venue: CAFE }])
  })
})

describe('ending a partner the live route needs', () => {
  const tight = () => routeGraph(passport({ finishCount: 2, stops: [1, 2, 3, 4].map(stop), regions: [{ name: 'North', enabled: true, stops: [0, 1] }, { name: 'South', enabled: true, stops: [2, 3] }], venues: [{ stop: 0, venueSpaceId: CAFE }, { stop: 1, venueSpaceId: BOOKS }] }), [], { ownerVenue: null })
  beforeEach(() => {
    mocks.updates.length = 0
    mocks.partner = { status: 'accepted' }
    mocks.authorizeHuntAction.mockResolvedValue({ id: 'h1', ownerSpaceId: null, currentVersionId: 'v1' })
  })

  it('is refused before it goes live, and nothing is written', async () => {
    mocks.loadVersionGraph.mockResolvedValue(tight())
    expect(await revokePartner('h1', 'organiser', CAFE, NOW)).toEqual({ ok: false, reason: 'breaks_route' })
    expect(mocks.updates).toEqual([])
  })

  it('is refused when the live route cannot be read', async () => {
    mocks.loadVersionGraph.mockResolvedValue(null)
    expect(await revokePartner('h1', 'organiser', CAFE, NOW)).toEqual({ ok: false, reason: 'route_unchecked' })
    expect(mocks.updates).toEqual([])
  })

  it('goes ahead when players can still finish without that venue', async () => {
    mocks.loadVersionGraph.mockResolvedValue(routeGraph(passport({ finishCount: 2, venues: [{ stop: 0, venueSpaceId: CAFE }] }), [], { ownerVenue: null }))
    expect(await revokePartner('h1', 'organiser', CAFE, NOW)).toEqual({ ok: true })
    expect(mocks.updates).toEqual([{ status: 'suspended', revoked_at: NOW }])
  })
})
