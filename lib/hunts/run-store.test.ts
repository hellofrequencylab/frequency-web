import { afterEach, describe, expect, it, vi } from 'vitest'
import { draftToGraph, publishRows } from './draft'
import { projectForPlayer } from './player'
import { assembleTrail, loadPublicTrailSummary, playerHuntState } from './run-store'

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
