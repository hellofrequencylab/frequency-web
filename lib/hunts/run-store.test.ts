import { describe, expect, it } from 'vitest'
import { draftToGraph, publishRows } from './draft'
import { projectForPlayer } from './player'
import { assembleTrail, playerHuntState } from './run-store'

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
