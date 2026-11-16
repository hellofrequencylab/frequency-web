import { describe, expect, it } from 'vitest'
import { closeVenue, missionBucket } from './count-rules'
import { evaluate, validateGraph } from './index'
import type { Credit, HuntGraph, Mission, RuleGroup } from './index'

const NOW = '2026-12-01T12:00:00Z'
const all = (...members: string[]): RuleGroup => ({ logic: 'all', members })
const count = (min_count: number, ...members: string[]): RuleGroup => ({ logic: 'count', min_count, members })
const cr = (...keys: string[]): Credit[] => keys.map((mission_key) => ({ mission_key }))
const codes = (graph: HuntGraph) => validateGraph(graph).blockers.map((b) => b.code)
const at = (venue: string, ...keys: string[]) => keys.map((placement_key) => ({ placement_key, venue }))

/** A shop mission: needs `start`, proven at its venue's placements. */
const shop = (key: string, venue: string, extra: Partial<Mission> = {}): Mission => ({
  mission_key: key,
  rule_groups: [all('start')],
  placements: at(venue, `${key}-code`),
  ...extra,
})

const start: Mission = { mission_key: 'start', rule_groups: [] }
const five = ['a', 'b', 'c', 'd', 'e'].map((k) => shop(`shop-${k}`, `venue-${k}`))
const fiveKeys = five.map((m) => m.mission_key)
/** District Passport: any 3 of 5 shops. */
const passport: HuntGraph = { missions: [start, ...five], finish: { rule_groups: [count(3, ...fiveKeys)] } }

describe('buckets and equivalent placements', () => {
  it('takes the bucket from the explicit bucket, then the venue, then the mission key', () => {
    expect(missionBucket({ mission_key: 'm', bucket: 'b', rule_groups: [], placements: at('v', 'p') })).toBe('b')
    expect(missionBucket({ mission_key: 'm', rule_groups: [], placements: at('v', 'p') })).toBe('v')
    expect(missionBucket({ mission_key: 'm', rule_groups: [] })).toBe('m')
  })

  it('keeps one bucket whichever equivalent placement is scanned: the lowest venue, not the order written', () => {
    const forward: Mission = { mission_key: 'm', rule_groups: [], placements: [...at('venue-a', 'p1'), ...at('venue-z', 'sub')] }
    const backward: Mission = { ...forward, placements: [...forward.placements!].reverse() }
    expect(missionBucket(forward)).toBe('venue-a')
    expect(missionBucket(backward)).toBe('venue-a')
  })

  it('counts a duplicate shop once: two missions in one venue are one bucket', () => {
    const twin = shop('shop-a-upstairs', 'venue-a')
    const graph: HuntGraph = {
      missions: [start, ...five, twin],
      finish: { rule_groups: [count(3, ...fiveKeys, twin.mission_key)] },
    }
    expect(validateGraph(graph).ok).toBe(true)
    // Three credits, but two of them are the same shop.
    expect(evaluate(graph, cr('start', 'shop-a', 'shop-a-upstairs', 'shop-b'), NOW).finished).toBe(false)
    expect(evaluate(graph, cr('start', 'shop-a', 'shop-a-upstairs', 'shop-b', 'shop-c'), NOW).finished).toBe(true)
  })

  it('counts a mission once however many credits or placements name it', () => {
    const graph: HuntGraph = {
      missions: [start, ...five.map((m) => (m.mission_key === 'shop-a' ? { ...m, placements: [...at('venue-a', 'front', 'back'), ...at('venue-sub', 'stand-in')] } : m))],
      finish: { rule_groups: [count(3, ...fiveKeys)] },
    }
    expect(validateGraph(graph).ok).toBe(true)
    const repeated: Credit[] = [...cr('start', 'shop-a', 'shop-a', 'shop-a'), ...cr('shop-b')]
    const ev = evaluate(graph, repeated, NOW)
    expect(ev.credited).toEqual(['shop-a', 'shop-b', 'start'])
    expect(ev.finished).toBe(false)
  })

  it('refuses a substitute venue that another counted mission already owns, so one visit cannot count twice', () => {
    const graph: HuntGraph = {
      missions: [start, ...five.map((m) => (m.mission_key === 'shop-a' ? { ...m, placements: [...at('venue-a', 'own'), ...at('venue-b', 'stand-in')] } : m))],
      finish: { rule_groups: [count(3, ...fiveKeys)] },
    }
    const r = validateGraph(graph)
    const twice = r.blockers.find((b) => b.code === 'VENUE_COUNTS_TWICE')
    expect(twice?.mission_keys).toEqual(['shop-a', 'shop-b'])
    // The same overlap is fine when the two missions share a bucket: they count once anyway.
    const shared: HuntGraph = { ...graph, missions: graph.missions.map((m) => (m.mission_key === 'shop-a' || m.mission_key === 'shop-b' ? { ...m, bucket: 'block-1' } : m)) }
    expect(codes(shared)).not.toContain('VENUE_COUNTS_TWICE')
  })

  it('does not apply the venue rule to ALL and ANY groups, where a second count changes nothing', () => {
    const overlap = [shop('m1', 'venue-a'), shop('m2', 'venue-b', { placements: [...at('venue-b', 'm2-code'), ...at('venue-a', 'm2-sub')] })]
    const graph: HuntGraph = { missions: [start, ...overlap], finish: { rule_groups: [all('m1', 'm2'), { logic: 'any', members: ['m1', 'm2'] }] } }
    expect(validateGraph(graph)).toEqual({ ok: true, blockers: [] })
  })
})

describe('N-of-M thresholds', () => {
  it('finishes at exactly N distinct buckets, in any credit order', () => {
    expect(evaluate(passport, cr('start', 'shop-a', 'shop-b'), NOW).finished).toBe(false)
    expect(evaluate(passport, cr('shop-e', 'shop-b', 'start', 'shop-c'), NOW).finished).toBe(true)
    expect(evaluate(passport, cr('shop-c', 'start', 'shop-b', 'shop-e'), NOW)).toEqual(evaluate(passport, cr('shop-e', 'shop-b', 'start', 'shop-c'), NOW))
  })

  it('refuses a threshold above the distinct venues, and accepts it at the boundary', () => {
    const sameVenue = five.map((m, i) => (i < 2 ? { ...m, placements: at('venue-a', `${m.mission_key}-code`) } : m))
    const graph = (min: number): HuntGraph => ({ missions: [start, ...sameVenue], finish: { rule_groups: [count(min, ...fiveKeys)] } })
    expect(validateGraph(graph(4)).ok).toBe(true)
    expect(codes(graph(5))).toContain('COUNT_IMPOSSIBLE')
  })
})

describe('a closed venue', () => {
  it('keeps a 3-of-5 feasible after one planned closure, and marks the closed shop closed', () => {
    const closed = closeVenue(passport, 'venue-c')
    expect(validateGraph(closed).ok).toBe(true)
    const ev = evaluate(closed, cr('start'), NOW)
    expect(ev.status['shop-c']).toBe('closed')
    expect(ev.eligible).toEqual(['shop-a', 'shop-b', 'shop-d', 'shop-e'])
  })

  it('refuses a threshold a closure makes impossible', () => {
    const tight: HuntGraph = { ...passport, finish: { rule_groups: [count(5, ...fiveKeys)] } }
    expect(validateGraph(tight).ok).toBe(true)
    const r = validateGraph(closeVenue(tight, 'venue-c'))
    expect(r.ok).toBe(false)
    expect(r.blockers.map((b) => b.code)).toContain('COUNT_IMPOSSIBLE')
  })

  it('stays feasible when the closed shop has a substitute placement, and still counts it once', () => {
    const withSub = five.map((m) => (m.mission_key === 'shop-c' ? { ...m, placements: [...at('venue-c', 'own'), ...at('venue-pop-up', 'stand-in')] } : m))
    const tight: HuntGraph = { missions: [start, ...withSub], finish: { rule_groups: [count(5, ...fiveKeys)] } }
    const closed = closeVenue(tight, 'venue-c')
    expect(validateGraph(closed).ok).toBe(true)
    expect(evaluate(closed, cr('start'), NOW).status['shop-c']).toBe('eligible')
    // The bucket did not move when the venue closed, so the credit counts as it always did.
    expect(missionBucket(closed.missions.find((m) => m.mission_key === 'shop-c')!)).toBe(missionBucket(withSub.find((m) => m.mission_key === 'shop-c')!))
  })

  it('keeps a credit earned before the venue closed', () => {
    const closed = closeVenue(passport, 'venue-a')
    const ev = evaluate(closed, cr('start', 'shop-a', 'shop-b', 'shop-d'), NOW)
    expect(ev.status['shop-a']).toBe('credited')
    expect(ev.finished).toBe(true)
  })

  it('reports an unreachable finish when a closed venue was the only way through', () => {
    const line: HuntGraph = {
      missions: [start, shop('gate', 'venue-gate'), { mission_key: 'end', rule_groups: [all('gate')] }],
      finish: { rule_groups: [all('end')] },
    }
    expect(validateGraph(line).ok).toBe(true)
    expect(codes(closeVenue(line, 'venue-gate'))).toContain('FINISH_UNREACHABLE')
  })
})

describe('regional chapters', () => {
  const north = ['n1', 'n2', 'n3'].map((k) => shop(k, `venue-${k}`))
  const south = ['s1', 's2', 's3'].map((k) => shop(k, `venue-${k}`))
  const shopKeys = [...north, ...south].map((m) => m.mission_key)
  const finale: Mission = { mission_key: 'finale', rule_groups: [count(3, ...shopKeys)] }
  const district = (extra: Partial<HuntGraph> = {}, missions: Mission[] = [start, ...north, ...south, finale]): HuntGraph => ({
    missions,
    finish: { rule_groups: [all('finale')] },
    chapters: [
      { chapter_key: 'north', enabled: true, members: ['n1', 'n2', 'n3'] },
      { chapter_key: 'south', enabled: true, members: ['s1', 's2', 's3'] },
    ],
    ...extra,
  })

  it('accepts a district where each chapter can finish on its own', () => {
    expect(validateGraph(district())).toEqual({ ok: true, blockers: [] })
  })

  it('refuses to publish when an enabled chapter cannot reach the finish on its own', () => {
    // South has only two shops left, so a south-only player can never reach 3.
    const graph = district({ chapters: [
      { chapter_key: 'north', enabled: true, members: ['n1', 'n2', 'n3'] },
      { chapter_key: 'south', enabled: true, members: ['s1', 's2'] },
    ] }, [start, ...north, ...south.slice(0, 2), { mission_key: 'finale', rule_groups: [count(3, 'n1', 'n2', 'n3', 's1', 's2')] }])
    const r = validateGraph(graph)
    expect(r.ok).toBe(false)
    expect(r.blockers).toHaveLength(1)
    expect(r.blockers[0]).toMatchObject({ code: 'CHAPTER_INFEASIBLE', mission_keys: ['s1', 's2'] })
    expect(r.blockers[0].message).toContain('"south"')
  })

  it('accepts the same district once the short chapter is switched off', () => {
    const graph = district({ chapters: [
      { chapter_key: 'north', enabled: true, members: ['n1', 'n2', 'n3'] },
      { chapter_key: 'south', enabled: false, members: ['s1', 's2'] },
    ] }, [start, ...north, ...south.slice(0, 2), { mission_key: 'finale', rule_groups: [count(3, 'n1', 'n2', 'n3', 's1', 's2')] }])
    expect(validateGraph(graph).ok).toBe(true)
  })

  it('refuses a chapter that a venue closure leaves short, and names only that chapter', () => {
    const r = validateGraph(closeVenue(district(), 'venue-s2'))
    expect(r.blockers.map((b) => b.code)).toEqual(['CHAPTER_INFEASIBLE'])
    expect(r.blockers[0].message).toContain('"south"')
  })

  it('refuses a chapter whose only finish needs a purchase, while a free chapter passes', () => {
    const paidSouth = south.map((m) => (m.mission_key === 's3' ? { ...m, requires_entitlement: true } : m))
    const r = validateGraph(district({}, [start, ...north, ...paidSouth, finale]))
    expect(r.blockers.map((b) => b.code)).toEqual(['CHAPTER_NO_FREE_FINISH'])
    expect(r.blockers[0].mission_keys).toEqual(['s1', 's2', 's3'])
  })

  it('lets every chapter use a shared mission that belongs to none', () => {
    const shared = shop('market', 'venue-market')
    const graph = district({ chapters: [
      { chapter_key: 'north', enabled: true, members: ['n1', 'n2'] },
      { chapter_key: 'south', enabled: true, members: ['s1', 's2'] },
    ] }, [start, ...north.slice(0, 2), ...south.slice(0, 2), shared, { mission_key: 'finale', rule_groups: [count(3, 'n1', 'n2', 's1', 's2', 'market')] }])
    expect(validateGraph(graph).ok).toBe(true)
  })

  it('takes no new credit in a disabled chapter and keeps the credits already earned there', () => {
    const graph = district({ chapters: [
      { chapter_key: 'north', enabled: true, members: ['n1', 'n2', 'n3'] },
      { chapter_key: 'south', enabled: false, members: ['s1', 's2', 's3'] },
    ] })
    expect(validateGraph(graph).ok).toBe(true)
    const ev = evaluate(graph, cr('start', 's1', 'n1'), NOW)
    expect(ev.status).toMatchObject({ s1: 'credited', s2: 'closed', s3: 'closed', n2: 'eligible' })
    expect(evaluate(graph, cr('start', 's1', 'n1', 'n2'), NOW).status.finale).toBe('eligible')
  })

  it('reports an unreachable finish when every chapter is off', () => {
    const graph = district({ chapters: [
      { chapter_key: 'north', enabled: false, members: ['n1', 'n2', 'n3'] },
      { chapter_key: 'south', enabled: false, members: ['s1', 's2', 's3'] },
    ] })
    expect(codes(graph)).toContain('COUNT_IMPOSSIBLE')
  })

  it('refuses chapter config that is unreadable, duplicated, empty, overlapping or points nowhere', () => {
    expect(codes(district({ chapters: 'north' as never }))).toEqual(['MALFORMED_GRAPH'])
    expect(codes(district({ chapters: [{ chapter_key: 'north', members: ['n1'] } as never] }))).toEqual(['MALFORMED_GRAPH'])
    const bad = validateGraph(district({ chapters: [
      { chapter_key: 'north', enabled: true, members: ['n1', 'ghost'] },
      { chapter_key: 'north', enabled: true, members: [] },
      { chapter_key: 'south', enabled: true, members: ['n1', 's1'] },
    ] }))
    expect(new Set(bad.blockers.map((b) => b.code))).toEqual(new Set(['CHAPTER_INVALID']))
    expect(bad.blockers).toHaveLength(4)
  })

  it('never throws on a placement without a key', () => {
    const graph: HuntGraph = { missions: [{ mission_key: 'm', rule_groups: [], placements: [{ venue: 'v' } as never] }], finish: { rule_groups: [all('m')] } }
    expect(codes(graph)).toEqual(['MALFORMED_GRAPH'])
    expect(() => evaluate(graph, [], NOW)).not.toThrow()
  })
})
