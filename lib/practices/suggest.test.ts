import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-643 (ADR-1606): a Pillar and Sub Focus suggested from a practice's nearest neighbours.
//
// The vote is pure and tested directly: the clear case, the empty case, the tie, the low-confidence
// case, and the never-re-suggest-what-is-set case. The read and the write run against an in-memory
// fake of the admin client (the repo's unit pattern, see lib/practices-clean.test.ts), with
// match_practices faked per seed.

type Row = Record<string, unknown>
const store: Record<string, Row[]> = { practices: [], pillars: [], practice_subcategories: [] }
let neighboursBySeed: Record<string, { id: string; title: string; similarity: number }[]> = {}
const rpcCalls: string[] = []
// Runs just before an update lands, to stage a write that races the curator's Accept.
let beforeUpdate: (() => void) | null = null

function from(table: string) {
  const preds: Array<(r: Row) => boolean> = []
  let patch: Row | null = null
  const matched = () => (store[table] ?? []).filter((r) => preds.every((p) => p(r)))
  const run = () => {
    if (patch) {
      beforeUpdate?.()
      const hit = matched()
      for (const r of hit) Object.assign(r, patch)
      return { data: hit.map((r) => ({ id: r.id })), error: null }
    }
    return { data: matched(), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    update: (p: Row) => { patch = p; return api },
    eq: (c: string, v: unknown) => { preds.push((r) => r[c] === v); return api },
    in: (c: string, vs: readonly unknown[]) => { const s = new Set(vs); preds.push((r) => s.has(r[c])); return api },
    is: (c: string, v: null) => { preds.push((r) => (r[c] ?? null) === v); return api },
    async maybeSingle() { return { data: matched()[0] ?? null, error: null } },
    then(resolve: (v: unknown) => unknown) { return Promise.resolve(run()).then(resolve) },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => from(t),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push(name)
      if (name !== 'match_practices') return Promise.resolve({ data: [], error: null })
      return Promise.resolve({ data: neighboursBySeed[String(args.exclude_id)] ?? [], error: null })
    },
  }),
}))

import {
  suggestPlacement,
  suggestPracticePlacement,
  suggestPlacements,
  unplacedPracticeIds,
  applyPlacementSuggestion,
  PLACEMENT_MIN_SIMILARITY,
  type PlacementNeighbour,
} from './suggest'

const n = (similarity: number, domain_id: string | null, subcategory_id: string | null = null): PlacementNeighbour => ({
  similarity,
  domain_id,
  subcategory_id,
})

describe('suggestPlacement: the neighbour vote', () => {
  it('picks the Pillar and the Sub Focus the close neighbours share, with a confidence', () => {
    const v = suggestPlacement([n(0.95, 'mind', 'breath'), n(0.92, 'mind', 'breath'), n(0.9, 'mind', 'focus'), n(0.85, 'body', 'cardio')])
    expect(v?.pillar?.id).toBe('mind')
    expect(v?.pillar?.agreeing).toBe(3)
    expect(v?.pillar?.voters).toBe(4)
    expect(v?.pillar?.confidence).toBeGreaterThan(0.8)
    expect(v?.subFocus?.id).toBe('breath')
    expect(v?.subFocus?.voters).toBe(3) // only the Mind neighbours vote on a Mind Sub Focus
  })

  it('suggests nothing with no neighbours', () => {
    expect(suggestPlacement([])).toBeNull()
  })

  it('suggests nothing when the only neighbours sit at or under the similarity floor', () => {
    expect(suggestPlacement([n(PLACEMENT_MIN_SIMILARITY, 'mind'), n(0.5, 'mind'), n(0.7, 'mind')])).toBeNull()
  })

  it('suggests nothing on a tie', () => {
    expect(suggestPlacement([n(0.9, 'mind'), n(0.9, 'body'), n(0.85, 'mind'), n(0.85, 'body')])).toBeNull()
  })

  it('suggests nothing when the winner carries too little of the weight', () => {
    // Mind leads but with under 60% of the weight.
    expect(suggestPlacement([n(0.9, 'mind'), n(0.9, 'mind'), n(0.9, 'body'), n(0.88, 'spirit'), n(0.86, 'expression')])).toBeNull()
  })

  it('suggests nothing from a single close neighbour, however close', () => {
    expect(suggestPlacement([n(0.99, 'mind', 'breath')])).toBeNull()
    expect(suggestPlacement([n(0.99, 'mind'), n(0.81, 'body')])).toBeNull()
  })

  it('never re-suggests a set Pillar, and scopes the Sub Focus vote to it', () => {
    const v = suggestPlacement(
      [n(0.95, 'body', 'cardio'), n(0.94, 'body', 'cardio'), n(0.9, 'mind', 'breath'), n(0.9, 'mind', 'breath')],
      { domain_id: 'mind', subcategory_id: null },
    )
    expect(v?.pillar).toBeNull()
    expect(v?.subFocus?.id).toBe('breath')
  })

  it('suggests nothing for a practice that has both', () => {
    expect(
      suggestPlacement([n(0.95, 'mind', 'breath'), n(0.94, 'mind', 'breath')], { domain_id: 'body', subcategory_id: 'cardio' }),
    ).toBeNull()
  })
})

const EMB = '[0.1,0.2]'

beforeEach(() => {
  store.practices = [
    { id: 'seed', domain_id: null, subcategory_id: null, embedding: EMB, focus_details: {} },
    { id: 'half', domain_id: 'mind', subcategory_id: null, embedding: EMB, focus_details: { mind: { instructions: 'x', timing: '' } } },
    { id: 'placed', domain_id: 'mind', subcategory_id: 'breath', embedding: EMB, focus_details: {} },
    { id: 'blank', domain_id: null, subcategory_id: null, embedding: null, focus_details: {} },
    { id: 'a', domain_id: 'mind', subcategory_id: 'breath' },
    { id: 'b', domain_id: 'mind', subcategory_id: 'breath' },
    { id: 'c', domain_id: 'body', subcategory_id: 'cardio' },
  ]
  store.pillars = [{ id: 'mind', name: 'Mind' }, { id: 'body', name: 'Body' }]
  store.practice_subcategories = [
    { id: 'breath', name: 'Breathwork', domain_id: 'mind' },
    { id: 'cardio', name: 'Cardio', domain_id: 'body' },
  ]
  const close = [
    { id: 'a', title: 'A', similarity: 0.95 },
    { id: 'b', title: 'B', similarity: 0.93 },
    { id: 'c', title: 'C', similarity: 0.82 },
  ]
  neighboursBySeed = { seed: close, half: close, placed: close }
  rpcCalls.length = 0
  beforeUpdate = null
})

describe('the read: match_practices on the practice embedding', () => {
  it('names the suggested Pillar and Sub Focus', async () => {
    const s = await suggestPracticePlacement('seed')
    expect(s?.pillar).toMatchObject({ id: 'mind', name: 'Mind', agreeing: 2 })
    expect(s?.subFocus).toMatchObject({ id: 'breath', name: 'Breathwork' })
    expect(rpcCalls).toEqual(['match_practices'])
  })

  it('asks nothing about a placed practice or one with no embedding yet', async () => {
    const out = await suggestPlacements(['placed', 'blank'])
    expect(out.size).toBe(0)
    expect(rpcCalls).toEqual([])
  })

  it('lists the practices missing a Pillar or a Sub Focus', async () => {
    expect((await unplacedPracticeIds(['seed', 'half', 'placed'])).sort()).toEqual(['half', 'seed'])
  })
})

describe('the write: accept fills only what is empty', () => {
  it('files the Pillar and Sub Focus and seeds an empty focus map', async () => {
    const r = await applyPlacementSuggestion('seed', { pillarId: 'mind', subFocusId: 'breath' })
    expect(r).toEqual({ pillar: 'Mind', subFocus: 'Breathwork' })
    const row = store.practices.find((p) => p.id === 'seed')
    expect(row).toMatchObject({ domain_id: 'mind', subcategory_id: 'breath', focus_details: { mind: { instructions: '', timing: '' } } })
  })

  it('fills only the Sub Focus on a practice that has a Pillar, and leaves its focus map alone', async () => {
    const r = await applyPlacementSuggestion('half', { pillarId: null, subFocusId: 'breath' })
    expect(r).toEqual({ pillar: null, subFocus: 'Breathwork' })
    const row = store.practices.find((p) => p.id === 'half')
    expect(row).toMatchObject({ domain_id: 'mind', subcategory_id: 'breath', focus_details: { mind: { instructions: 'x', timing: '' } } })
  })

  it('refuses a suggestion that moved since the curator saw it', async () => {
    await expect(applyPlacementSuggestion('seed', { pillarId: 'body', subFocusId: null })).rejects.toThrow(/changed/)
    expect(store.practices.find((p) => p.id === 'seed')?.domain_id).toBeNull()
  })

  it('never overwrites a Pillar set in the meantime', async () => {
    // Another curator files the practice under Body between the re-read and the write.
    const row = store.practices.find((p) => p.id === 'seed') as Row
    beforeUpdate = () => { row.domain_id = 'body' }
    await expect(applyPlacementSuggestion('seed', { pillarId: 'mind', subFocusId: 'breath' })).rejects.toThrow(/while you were looking/)
    expect(row).toMatchObject({ domain_id: 'body', subcategory_id: null })
  })
})
