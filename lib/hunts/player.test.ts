import { describe, expect, it } from 'vitest'
import { draftToGraph, publishRows, stopKey } from './draft'
import { projectForPlayer } from './player'

const stops = [1, 2, 3].map((n) => ({ place: `Place ${n}`, clue: `Clue ${n}`, hint: n === 2 ? 'Near the water' : undefined, placementReady: true }))
const draft = { title: 'T', hook: 'H', area: 'A', stops, routeTestedAtRevision: 1, permissionConfirmed: true }
const graph = draftToGraph(draft)
const content = publishRows(draft).missions
const base = { graph, content, now: '2026-11-10T00:00:00Z', huntState: 'published' as const, revision: 7 }

describe('projectForPlayer', () => {
  it('shows the first clue only, with no place name, and hides everything later', () => {
    const p = projectForPlayer({ ...base, credits: [] })
    expect(p.stops[0]).toMatchObject({ state: 'eligible', clue: 'Clue 1' })
    expect(p.stops[0]).not.toHaveProperty('place')
    expect(p.stops[1]).toEqual({ key: stopKey(1), position: 2, state: 'locked', teaser: 'Near the water' })
    expect(p.stops[2]).toEqual({ key: stopKey(2), position: 3, state: 'locked' })
    expect(JSON.stringify(p)).not.toContain('Clue 2')
    expect(JSON.stringify(p)).not.toContain('Place 2')
    expect(p.nextKey).toBe('stop-1')
    expect(p.canClaim).toBe(true)
  })
  it('reveals the place of a visited stop and opens the next clue', () => {
    const p = projectForPlayer({ ...base, credits: [{ mission_key: 'stop-1' }] })
    expect(p.stops[0]).toMatchObject({ state: 'credited', place: 'Place 1', clue: 'Clue 1' })
    expect(p.stops[1]).toMatchObject({ state: 'eligible', clue: 'Clue 2' })
    expect(p.progress).toEqual({ done: 1, total: 3, finished: false })
  })
  it('finishes after the last stop and offers nothing more to claim', () => {
    const p = projectForPlayer({ ...base, credits: [{ mission_key: 'stop-1' }, { mission_key: 'stop-2' }, { mission_key: 'stop-3' }] })
    expect(p.progress.finished).toBe(true)
    expect(p.nextKey).toBeNull()
    expect(p.canClaim).toBe(false)
  })
  it('gives the same answer for the same input on any device and carries the revision', () => {
    const a = projectForPlayer({ ...base, credits: [{ mission_key: 'stop-1' }] })
    const b = projectForPlayer({ ...base, credits: [{ mission_key: 'stop-1' }] })
    expect(a).toEqual(b)
    expect(a.revision).toBe(7)
  })
  it('stops claiming when paused or closed but keeps the progress', () => {
    const paused = projectForPlayer({ ...base, huntState: 'paused', credits: [{ mission_key: 'stop-1' }] })
    expect(paused.canClaim).toBe(false)
    expect(paused.banner).toBe('paused')
    expect(paused.nextKey).toBeNull()
    expect(paused.progress.done).toBe(1)
    expect(paused.stops[0]).toMatchObject({ state: 'credited', place: 'Place 1' })
    expect(projectForPlayer({ ...base, huntState: 'closed', credits: [] }).banner).toBe('closed')
  })
})
