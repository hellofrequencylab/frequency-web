// FH-042S item (2): a Mystery whose tries are used up is no longer named as the next stop; its stand-in is.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Challenge } from './challenges'
import { draftToGraph, publishRows } from './draft'
import { projectForPlayer } from './player'
import { loadLockedMysteries } from './run-store'

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
afterEach(() => from.mockReset())

const stops = [1, 2, 3, 4].map((n) => ({ place: `Place ${n}`, clue: `Clue ${n}`, placementReady: true }))
const draft = { title: 'T', hook: '', area: '', audience: '', stops, routeTestedAtRevision: 1, permissionConfirmed: true }
const blank = { mystery: false, question: '', hint: '', answerHash: null, fork: '', standIn: '' } as const
// Stop 1, then a Mystery at stop 2 paired with a stand-in at stop 3, then stop 4.
const challenges: Challenge[] = [
  { ...blank, stop: 1, mystery: true, question: 'Q', answerHash: `s1:${'a'.repeat(32)}:${'b'.repeat(64)}`, standIn: '1' },
  { ...blank, stop: 2, standIn: '1' },
]
const base = {
  graph: draftToGraph(draft, challenges),
  content: publishRows(draft, challenges).missions,
  credits: [{ mission_key: 'stop-1' }],
  now: '2026-11-18T12:00:00Z',
  huntState: 'published' as const,
  revision: 2,
}

describe('projectForPlayer with a locked-out Mystery', () => {
  it('names the Mystery next while it has tries left', () => {
    const p = projectForPlayer(base)
    expect(p.nextKey).toBe('stop-2')
    expect(p.stops[1]).not.toHaveProperty('answerLocked')
  })

  it('skips it once the tries are used, marks it, and names the stand-in', () => {
    const p = projectForPlayer({ ...base, lockedMysteries: ['stop-2'] })
    expect(p.nextKey).toBe('stop-3')
    expect(p.stops[1]).toMatchObject({ state: 'eligible', answerLocked: true })
    expect(p.canClaim).toBe(true)
  })
})

/** A PostgREST stand-in for the two reads loadLockedMysteries makes. */
function tables(rows: { hunt_runs: Record<string, unknown>[]; hunt_claims: Record<string, unknown>[] }) {
  const calls: { table: string; filters: string[] }[] = []
  from.mockImplementation((table: keyof typeof rows) => {
    let matches = rows[table] ?? []
    const call = { table, filters: [] as string[] }
    calls.push(call)
    const q = {
      select: () => q,
      eq(c: string, v: unknown) { call.filters.push(`eq:${c}`); matches = matches.filter((r) => r[c] === v); return q },
      in(c: string, v: unknown[]) { call.filters.push(`in:${c}`); matches = matches.filter((r) => v.includes(r[c])); return q },
      like(c: string, pattern: string) { call.filters.push(`like:${c}`); matches = matches.filter((r) => String(r[c]).startsWith(pattern.replace('%', ''))); return q },
      maybeSingle: async () => ({ data: matches[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; count: number; error: null }) => unknown) => resolve({ data: matches, count: matches.length, error: null }),
    }
    return q
  })
  return calls
}

const attempt = (n: number, correct: boolean, mission = 'stop-2') => ({ run_id: 'run-1', mission_key: mission, evidence_id: `answer:${n}`, correct: String(correct) })

describe('loadLockedMysteries', () => {
  const runs = [{ id: 'run-1', subject_profile_id: 'player-1' }]

  it('locks a Mystery after five wrong tries, and never one answered right', async () => {
    tables({ hunt_runs: runs, hunt_claims: [1, 2, 3, 4, 5].map((n) => attempt(n, false)) })
    expect(await loadLockedMysteries('run-1', 'player-1', ['stop-2'])).toEqual(['stop-2'])
    tables({ hunt_runs: runs, hunt_claims: [...[1, 2, 3, 4].map((n) => attempt(n, false)), attempt(5, true)] })
    expect(await loadLockedMysteries('run-1', 'player-1', ['stop-2'])).toEqual([])
    tables({ hunt_runs: runs, hunt_claims: [1, 2, 3].map((n) => attempt(n, false)) })
    expect(await loadLockedMysteries('run-1', 'player-1', ['stop-2'])).toEqual([])
  })

  it('reads nothing for another player\'s run or a Trail with no Mystery', async () => {
    const calls = tables({ hunt_runs: runs, hunt_claims: [1, 2, 3, 4, 5].map((n) => attempt(n, false)) })
    expect(await loadLockedMysteries('run-1', 'player-2', ['stop-2'])).toEqual([])
    expect(calls.map((c) => c.table)).toEqual(['hunt_runs'])
    expect(await loadLockedMysteries('run-1', 'player-1', [])).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('reads only answer attempts on this run, for the Mysteries asked about', async () => {
    const calls = tables({ hunt_runs: runs, hunt_claims: [] })
    await loadLockedMysteries('run-1', 'player-1', ['stop-2'])
    expect(calls[1]).toEqual({ table: 'hunt_claims', filters: ['eq:run_id', 'in:mission_key', 'like:evidence_id'] })
  })
})
