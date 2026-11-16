import { afterEach, describe, expect, it, vi } from 'vitest'
import { draftToGraph, publishRows } from './draft'
import { projectForPlayer } from './player'
import { evaluate, validateGraph } from './graph'
import { assembleTrail, loadPublicTrailSummary, loadPublishedTrail, playerHuntState } from './run-store'

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
afterEach(() => from.mockReset())

const stops = Array.from({ length: 10 }, (_, i) => ({ place: `P${i + 1}`, clue: `C${i + 1}`, placementReady: true }))
const draft = { title: 'T', hook: 'H', area: 'A', audience: 'All', stops, routeTestedAtRevision: 1, permissionConfirmed: true }

// Rows as the published tables hold them, built from the same draft the editor publishes.
function rows() {
  const pub = publishRows(draft)
  const missions = pub.missions.map((m) => ({ ...m, visible_body: m.visible_body, locked_teaser: m.locked_teaser, opens_at: null, closes_at: null }))
  const groups = pub.groups.map((g, i) => ({ id: `g${i}`, target_mission_key: g.target_mission_key, target_finish: g.target_finish, logic: g.logic, min_count: null, group_key: g.key }))
  const members = pub.groups.flatMap((g, i) => g.members.map((m) => ({ group_id: `g${i}`, member_mission_key: m })))
  return { missions, groups, members }
}

describe('assembleTrail', () => {
  it('rebuilds the same graph the editor published and orders stop-10 after stop-9', () => {
    const { missions, groups, members } = rows()
    const { graph, content } = assembleTrail([...missions].reverse(), groups, members)
    expect(content.map((c) => c.mission_key).slice(-2)).toEqual(['stop-9', 'stop-10'])
    const want = draftToGraph(draft)
    expect(graph.missions.map((m) => [m.mission_key, m.rule_groups.map((g) => g.members)])).toEqual(
      want.missions.map((m) => [m.mission_key, m.rule_groups.map((g) => g.members)]),
    )
    expect(graph.finish.rule_groups.map((g) => g.members)).toEqual(want.finish.rule_groups.map((g) => g.members))
  })
  it('feeds the player projection and keeps later stops hidden', () => {
    const { missions, groups, members } = rows()
    const { graph, content } = assembleTrail(missions, groups, members)
    const p = projectForPlayer({ graph, content, credits: [{ mission_key: 'stop-1' }], now: '2026-11-10T00:00:00Z', huntState: 'published', revision: 3 })
    expect(p.nextKey).toBe('stop-2')
    expect(JSON.stringify(p)).not.toContain('C3')
  })
})

describe('playerHuntState', () => {
  it('maps Hunt status to what a player sees', () => {
    expect(playerHuntState('live')).toBe('published')
    expect(playerHuntState('paused')).toBe('paused')
    expect(playerHuntState('ended')).toBe('closed')
    expect(playerHuntState('cancelled')).toBe('closed')
    expect(playerHuntState('draft')).toBeNull()
    expect(playerHuntState('scheduled')).toBeNull()
  })
})

function mockSummaryQueries(visibility: string, status: string, versionStatus: string) {
  const tables: Record<string, Record<string, unknown>[]> = {
    hunts: [{ id: 'h1', slug: 'north-county', visibility, status, current_version_id: 'v1', revision: 1 }],
    hunt_versions: [{ id: 'v1', hunt_id: 'h1', status: versionStatus, trail_title: ' North County Trail ', trail_hook: ' A day outdoors ' }],
    hunt_missions: [{ hunt_id: 'h1', version_id: 'v1', mission_key: 'stop-1', visible_body: 'private clue' }],
  }
  const select = vi.fn()
  from.mockImplementation((table: string) => {
    let matches = tables[table] ?? []
    const query = {
      select: (...args: unknown[]) => { select(table, ...args); return query },
      eq: (column: string, value: unknown) => { matches = matches.filter((row) => row[column] === value); return query },
      in: (column: string, values: unknown[]) => { matches = matches.filter((row) => values.includes(row[column])); return query },
      maybeSingle: async () => ({ data: matches[0] ?? null, error: null }),
      then: (resolve: (response: { data: null; count: number; error: null }) => unknown) => resolve({ data: null, count: matches.length, error: null }),
    }
    return query
  })
  return select
}

describe('loadPublicTrailSummary', () => {
  it.each(['public', 'unlisted'])('reads just the published %s Trail summary and a count', async (visibility) => {
    const select = mockSummaryQueries(visibility, 'live', 'published')
    const summary = await loadPublicTrailSummary('north-county')
    expect(summary).toEqual({ slug: 'north-county', title: 'North County Trail', description: 'A day outdoors', stopCount: 1 })
    expect(select.mock.calls).toEqual([
      ['hunts', 'id, slug, status, current_version_id, revision'],
      ['hunt_versions', 'id, trail_title:policy->trail->>title, trail_hook:policy->trail->>hook'],
      ['hunt_missions', 'mission_key', { count: 'exact', head: true }],
    ])
  })

  it.each([
    ['private', 'live', 'published'],
    ['public', 'paused', 'published'],
    ['public', 'live', 'draft'],
  ])('refuses a %s, %s Hunt with a %s version before reading missions', async (visibility, status, versionStatus) => {
    mockSummaryQueries(visibility, status, versionStatus)
    expect(await loadPublicTrailSummary('north-county')).toBeNull()
    expect(from).not.toHaveBeenCalledWith('hunt_missions')
  })
})

// FH-030: a published version that carries count rules (N-of-M groups, venue bindings, chapters).
function passportRows() {
  const shops = ['shop-1', 'shop-2', 'shop-3', 'shop-4']
  const missions = shops.map((mission_key) => ({ mission_key, title: mission_key, visible_body: null, locked_teaser: null, opens_at: null, closes_at: null }))
  const groups = [{ id: 'finish', target_mission_key: null, target_finish: true, logic: 'count' as const, min_count: 2, group_key: 'finish' }]
  const members = shops.map((member_mission_key) => ({ group_id: 'finish', member_mission_key }))
  // shop-1 and shop-2 are two counters in one venue; shop-3 also has a second code at its own venue.
  const placements = [
    { mission_key: 'shop-1', placement_id: 'pl-1', venue_space_id: 'space-a' },
    { mission_key: 'shop-2', placement_id: 'pl-2', venue_space_id: 'space-a' },
    { mission_key: 'shop-3', placement_id: 'pl-3', venue_space_id: 'space-c' },
    { mission_key: 'shop-3', placement_id: 'pl-3b', venue_space_id: 'space-c' },
    { mission_key: 'shop-4', placement_id: 'pl-4', venue_space_id: null },
  ]
  const chapters = [{ chapter_key: 'north', enabled: true, members: ['shop-1', 'shop-2', 'shop-3'] }, { chapter_key: 'south', enabled: false, members: ['shop-4'] }]
  return { missions, groups, members, placements, chapters }
}

describe('assembleTrail with count rules', () => {
  it('gives two missions in one venue one bucket, so the same shop never counts twice', () => {
    const { missions, groups, members, placements, chapters } = passportRows()
    const { graph } = assembleTrail(missions, groups, members, { placements, chapters })
    expect(validateGraph(graph)).toEqual({ ok: true, blockers: [] })
    expect(graph.missions.find((m) => m.mission_key === 'shop-3')?.placements).toEqual([
      { placement_key: 'pl-3', venue: 'space-c' },
      { placement_key: 'pl-3b', venue: 'space-c' },
    ])
    const now = '2026-11-16T00:00:00Z'
    expect(evaluate(graph, [{ mission_key: 'shop-1' }, { mission_key: 'shop-2' }], now).finished).toBe(false)
    expect(evaluate(graph, [{ mission_key: 'shop-1' }, { mission_key: 'shop-3' }], now).finished).toBe(true)
    // The disabled chapter takes no new credit.
    expect(evaluate(graph, [], now).status['shop-4']).toBe('closed')
  })
  it('leaves a version without bindings or chapters exactly as before', () => {
    const { missions, groups, members } = rows()
    expect(assembleTrail(missions, groups, members, { placements: [], chapters: [] })).toEqual(assembleTrail(missions, groups, members))
    expect(assembleTrail(missions, groups, members).graph).not.toHaveProperty('chapters')
  })
})

function mockTrailQueries(extra: { placements?: Record<string, unknown>[]; chapters?: unknown } = {}) {
  const p = passportRows()
  const tables: Record<string, Record<string, unknown>[]> = {
    hunts: [{ id: 'h1', slug: 'passport', visibility: 'public', status: 'live', current_version_id: 'v1', revision: 4 }],
    hunt_versions: [{ id: 'v1', hunt_id: 'h1', status: 'published', trail_title: 'Passport', trail_hook: null, chapters: 'chapters' in extra ? extra.chapters : p.chapters }],
    hunt_missions: p.missions.map((m) => ({ ...m, version_id: 'v1' })),
    hunt_rule_groups: p.groups.map((g) => ({ ...g, version_id: 'v1' })),
    hunt_rule_group_members: p.members.map((m) => ({ ...m, version_id: 'v1' })),
    hunt_mission_placements: (extra.placements ?? p.placements).map((b) => ({ ...b, version_id: 'v1' })),
  }
  from.mockImplementation((table: string) => {
    let matches = tables[table] ?? []
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { matches = matches.filter((row) => row[column] === value); return query },
      in: (column: string, values: unknown[]) => { matches = matches.filter((row) => values.includes(row[column])); return query },
      maybeSingle: async () => ({ data: matches[0] ?? null, error: null }),
      then: (resolve: (response: { data: typeof matches; count: number; error: null }) => unknown) => resolve({ data: matches, count: matches.length, error: null }),
    }
    return query
  })
}

describe('loadPublishedTrail with count rules', () => {
  it('reads the version bindings and chapters into the graph the claim path evaluates', async () => {
    mockTrailQueries()
    const trail = await loadPublishedTrail('passport')
    expect(trail?.graph.chapters).toEqual(passportRows().chapters)
    expect(trail?.graph.missions.map((m) => m.placements?.[0]?.venue ?? null)).toEqual(['space-a', 'space-a', 'space-c', null])
    expect(from).toHaveBeenCalledWith('hunt_mission_placements')
  })
  it('reads a version with no chapters key as no chapters', async () => {
    mockTrailQueries({ chapters: undefined })
    expect((await loadPublishedTrail('passport'))?.graph).not.toHaveProperty('chapters')
  })
  it.each([
    ['a binding to a mission the version does not hold', { placements: [{ mission_key: 'ghost', placement_id: 'pl-9', venue_space_id: null }] }],
    ['a binding without a placement', { placements: [{ mission_key: 'shop-1', venue_space_id: 'space-a' }] }],
    ['chapters that are not a list', { chapters: { north: true } }],
  ])('fails closed on %s', async (_label, extra) => {
    mockTrailQueries(extra)
    expect(await loadPublishedTrail('passport')).toBeNull()
  })
})
