import { describe, expect, it } from 'vitest'
import { evaluate, MAX_EDGES, MAX_MISSIONS, validateGraph } from './index'
import type { Credit, HuntGraph, Mission, RuleGroup } from './index'

// Fixture shapes follow examples/presets.json in the Frequency Hunts plan
// (prerequisites: [{mode, keys, minimum}] becomes rule_groups: [{logic, members, min_count}]).
type PresetGroup = { mode: 'all' | 'any' | 'count'; keys: string[]; minimum?: number }
const g = (p: PresetGroup): RuleGroup => ({ logic: p.mode, members: p.keys, min_count: p.minimum })
const m = (key: string, pre: PresetGroup[] = [], extra: Partial<Mission> = {}): Mission => ({
  mission_key: key,
  rule_groups: pre.map(g),
  ...extra,
})
const all = (...keys: string[]): PresetGroup => ({ mode: 'all', keys })
const cr = (...keys: string[]): Credit[] => keys.map((mission_key) => ({ mission_key }))
const NOW = '2026-12-01T12:00:00Z'

const trail: HuntGraph = {
  missions: [m('start'), m('mural', [all('start')]), m('garden', [all('mural')]), m('finish', [all('garden')])],
  finish: { rule_groups: [g(all('finish'))] },
}

const shops = ['shop-a', 'shop-b', 'shop-c', 'shop-d', 'shop-e']
const shopMissions = shops.map((k) => m(k, [all('start')], { bucket: `space-${k.slice(-1)}` }))
const passport: HuntGraph = {
  missions: [m('start'), ...shopMissions],
  finish: { rule_groups: [g({ mode: 'count', keys: shops, minimum: 3 })] },
}
const rally: HuntGraph = {
  missions: [
    m('start'),
    ...shopMissions,
    m('finale', [{ mode: 'count', keys: shops, minimum: 3 }]),
  ],
  finish: { rule_groups: [g(all('finale'))] },
}

const codes = (graph: HuntGraph) => validateGraph(graph).blockers.map((b) => b.code)

describe('validateGraph on preset fixtures', () => {
  it('accepts Trail, Passport and Rally', () => {
    for (const graph of [trail, passport, rally]) expect(validateGraph(graph)).toEqual({ ok: true, blockers: [] })
  })
  it('accepts a progressive dinner whose paid tastings sit outside the free finish', () => {
    const dinner: HuntGraph = {
      missions: [
        m('start'),
        m('public-finish', [all('start')]),
        m('tasting-1', [all('start')], { requires_entitlement: true }),
        m('tasting-2', [all('tasting-1')], { requires_entitlement: true }),
      ],
      finish: { rule_groups: [g(all('public-finish'))] },
    }
    expect(validateGraph(dinner).ok).toBe(true)
  })
})

describe('validateGraph blockers', () => {
  it('finds a cycle and names its missions', () => {
    const graph: HuntGraph = {
      missions: [m('a', [all('b')]), m('b', [all('a')]), m('c')],
      finish: { rule_groups: [g(all('c'))] },
    }
    const r = validateGraph(graph)
    expect(r.ok).toBe(false)
    const cyc = r.blockers.find((b) => b.code === 'CYCLE')
    expect(cyc?.mission_keys).toEqual(['a', 'b'])
  })
  it('finds a self-loop', () => {
    expect(codes({ missions: [m('a', [all('a')])], finish: { rule_groups: [g(all('a'))] } })).toContain('CYCLE')
  })
  it('finds a missing reference, in a mission and in finish', () => {
    const r = validateGraph({ missions: [m('a', [all('ghost')])], finish: { rule_groups: [g(all('nope'))] } })
    expect(r.blockers.filter((b) => b.code === 'MISSING_REF')).toHaveLength(2)
  })
  it('flags duplicate keys', () => {
    expect(codes({ missions: [m('a'), m('a')], finish: { rule_groups: [g(all('a'))] } })).toContain('DUPLICATE_MISSION')
  })
  it('flags impossible count thresholds, including shared buckets', () => {
    const tooMany = { ...passport, finish: { rule_groups: [g({ mode: 'count', keys: shops, minimum: 6 })] } }
    expect(codes(tooMany)).toContain('COUNT_IMPOSSIBLE')
    const shared: HuntGraph = {
      missions: [m('start'), m('x', [all('start')], { bucket: 's' }), m('y', [all('start')], { bucket: 's' })],
      finish: { rule_groups: [g({ mode: 'count', keys: ['x', 'y'], minimum: 2 })] },
    }
    expect(codes(shared)).toContain('COUNT_IMPOSSIBLE')
  })
  it('flags a count with no usable min_count', () => {
    const bad: HuntGraph = { missions: [m('a')], finish: { rule_groups: [{ logic: 'count', members: ['a'] }] } }
    expect(codes(bad)).toContain('COUNT_INVALID')
  })
  it('flags empty groups and an empty finish', () => {
    expect(codes({ missions: [m('a', [{ mode: 'all', keys: [] }])], finish: { rule_groups: [] } })).toEqual(
      expect.arrayContaining(['GROUP_EMPTY', 'FINISH_EMPTY']),
    )
  })
  it('flags invalid and empty windows', () => {
    const graph: HuntGraph = {
      missions: [
        m('a', [], { open: 'tomorrow' }),
        m('b', [], { open: '2026-12-02T00:00:00Z', close: '2026-12-02T00:00:00Z' }),
        m('c', [], { open: '2026-12-02T00:00:00-08:00' }),
      ],
      finish: { rule_groups: [g({ mode: 'any', keys: ['a', 'b', 'c'] })] },
    }
    const r = validateGraph(graph)
    expect(r.blockers.filter((b) => b.code === 'WINDOW_INVALID').flatMap((b) => b.mission_keys)).toEqual(['a'].concat('c').sort())
    expect(codes(graph)).toContain('WINDOW_EMPTY')
  })
  it('flags a mission that closes before its prerequisite opens', () => {
    const graph: HuntGraph = {
      missions: [
        m('start', [], { open: '2026-12-10T00:00:00Z' }),
        m('late', [all('start')], { close: '2026-12-05T00:00:00Z' }),
      ],
      finish: { rule_groups: [g(all('late'))] },
    }
    const r = validateGraph(graph)
    expect(r.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(['WINDOW_UNREACHABLE', 'FINISH_UNREACHABLE']))
  })
  it('allows adjacent windows: [open, close) means close of one may equal open of the next', () => {
    const graph: HuntGraph = {
      missions: [
        m('one', [], { open: '2026-12-01T00:00:00Z', close: '2026-12-02T00:00:00Z' }),
        m('two', [all('one')], { open: '2026-12-02T00:00:00Z', close: '2026-12-03T00:00:00Z' }),
      ],
      finish: { rule_groups: [g(all('two'))] },
    }
    expect(validateGraph(graph).ok).toBe(true)
  })
  it('flags a finish that nothing can unlock', () => {
    const graph: HuntGraph = {
      missions: [m('a', [{ mode: 'count', keys: ['b'], minimum: 1 }]), m('b', [all('a')])],
      finish: { rule_groups: [g(all('b'))] },
    }
    expect(codes(graph)).toEqual(expect.arrayContaining(['CYCLE', 'FINISH_UNREACHABLE']))
  })
  it('requires a free path to the finish', () => {
    const graph: HuntGraph = {
      missions: [m('start'), m('vip', [all('start')], { requires_entitlement: true })],
      finish: { rule_groups: [g(all('vip'))] },
    }
    expect(codes(graph)).toEqual(['NO_FREE_PATH'])
    const alt: HuntGraph = {
      missions: [...graph.missions, m('free', [all('start')])],
      finish: { rule_groups: [g({ mode: 'any', keys: ['vip', 'free'] })] },
    }
    expect(validateGraph(alt).ok).toBe(true)
  })
  it('enforces the 30 mission and 100 edge limits', () => {
    const many = (n: number): HuntGraph => ({
      missions: Array.from({ length: n }, (_, i) => m(`m${i}`)),
      finish: { rule_groups: [g(all('m0'))] },
    })
    expect(validateGraph(many(MAX_MISSIONS)).ok).toBe(true)
    expect(codes(many(MAX_MISSIONS + 1))).toEqual(['MISSION_LIMIT'])
    const keys = Array.from({ length: 21 }, (_, i) => `m${i}`)
    const dense: HuntGraph = {
      missions: [...keys.map((k) => m(k)), ...Array.from({ length: 6 }, (_, i) => m(`d${i}`, [{ mode: 'all', keys: keys.slice(0, 17) }]))],
      finish: { rule_groups: [g(all('m0'))] },
    }
    expect(codes(dense)).toEqual(['EDGE_LIMIT'])
    expect(6 * 17).toBeGreaterThan(MAX_EDGES)
  })
  it('never throws on garbage', () => {
    for (const bad of [null, undefined, 5, {}, { missions: 3 }, { missions: [null], finish: {} }, { missions: [{ mission_key: 'a' }], finish: { rule_groups: [] } }]) {
      const r = validateGraph(bad as unknown as HuntGraph)
      expect(r.ok).toBe(false)
      expect(r.blockers[0].code).toBe('MALFORMED_GRAPH')
    }
  })
})

describe('evaluate', () => {
  it('walks a sequential Trail one step at a time', () => {
    let r = evaluate(trail, [], NOW)
    expect(r.eligible).toEqual(['start'])
    expect(r.finished).toBe(false)
    r = evaluate(trail, cr('start', 'mural'), NOW)
    expect(r.eligible).toEqual(['garden'])
    expect(r.status.finish).toBe('locked')
    r = evaluate(trail, cr('start', 'mural', 'garden', 'finish'), NOW)
    expect(r.finished).toBe(true)
    expect(r.eligible).toEqual([])
  })
  it('trusts recorded credits as given: unlock reads credits, not the path taken', () => {
    expect(evaluate(trail, cr('garden'), NOW).eligible).toEqual(['finish', 'start'])
  })
  it('Passport 3-of-5: finishes on the third distinct shop', () => {
    expect(evaluate(passport, cr('start', 'shop-a', 'shop-b'), NOW).finished).toBe(false)
    expect(evaluate(passport, cr('start', 'shop-a', 'shop-b', 'shop-c'), NOW).finished).toBe(true)
  })
  it('an alternate placement at a second approved venue never counts twice', () => {
    const credits: Credit[] = [
      { mission_key: 'shop-a', bucket: 'space-a' },
      { mission_key: 'shop-a', bucket: 'space-a2' },
      { mission_key: 'shop-b' },
    ]
    expect(evaluate(passport, credits, NOW).credited).toEqual(['shop-a', 'shop-b'])
    expect(evaluate(passport, credits, NOW).finished).toBe(false)
  })
  it('two missions in one bucket count once toward N-of-M', () => {
    const graph: HuntGraph = {
      missions: [m('x', [], { bucket: 's' }), m('y', [], { bucket: 's' }), m('z')],
      finish: { rule_groups: [g({ mode: 'count', keys: ['x', 'y', 'z'], minimum: 3 })] },
    }
    expect(evaluate(graph, cr('x', 'y', 'z'), NOW).finished).toBe(false)
    expect(evaluate({ ...graph, finish: { rule_groups: [g({ mode: 'count', keys: ['x', 'y', 'z'], minimum: 2 })] } }, cr('x', 'y', 'z'), NOW).finished).toBe(true)
  })
  it('ANY needs one credited member; ALL needs every one', () => {
    const any: HuntGraph = { missions: [m('a'), m('b')], finish: { rule_groups: [g({ mode: 'any', keys: ['a', 'b'] })] } }
    expect(evaluate(any, cr('b'), NOW).finished).toBe(true)
    expect(evaluate(any, [], NOW).finished).toBe(false)
    const both: HuntGraph = { missions: [m('a'), m('b')], finish: { rule_groups: [g(all('a', 'b'))] } }
    expect(evaluate(both, cr('a'), NOW).finished).toBe(false)
  })
  it('Rally: finale unlocks on three shops, finishing needs the finale', () => {
    const r = evaluate(rally, cr('start', 'shop-a', 'shop-c', 'shop-e'), NOW)
    expect(r.eligible).toEqual(['finale', 'shop-b', 'shop-d'])
    expect(r.finished).toBe(false)
    expect(evaluate(rally, cr('start', 'shop-a', 'shop-c', 'shop-e', 'finale'), NOW).finished).toBe(true)
  })
  it('several rule groups on one mission combine with AND', () => {
    const graph: HuntGraph = {
      missions: [m('a'), m('b'), m('c', [all('a'), all('b')])],
      finish: { rule_groups: [g(all('c'))] },
    }
    expect(evaluate(graph, cr('a'), NOW).status.c).toBe('locked')
    expect(evaluate(graph, cr('a', 'b'), NOW).status.c).toBe('eligible')
  })
  it('applies [open, close) windows exactly', () => {
    const graph: HuntGraph = {
      missions: [m('w', [], { open: '2026-12-01T00:00:00Z', close: '2026-12-02T00:00:00Z' })],
      finish: { rule_groups: [g(all('w'))] },
    }
    expect(evaluate(graph, [], '2026-11-30T23:59:59Z').status.w).toBe('scheduled')
    expect(evaluate(graph, [], '2026-12-01T00:00:00Z').status.w).toBe('eligible')
    expect(evaluate(graph, [], '2026-12-01T23:59:59.999Z').status.w).toBe('eligible')
    expect(evaluate(graph, [], '2026-12-02T00:00:00Z').status.w).toBe('closed')
    expect(evaluate(graph, [], new Date('2026-12-01T12:00:00Z')).status.w).toBe('eligible')
    expect(evaluate(graph, [], 'not a time').status.w).toBe('closed')
  })
  it('keeps an earned credit after its window closes', () => {
    const graph: HuntGraph = {
      missions: [m('w', [], { close: '2026-12-02T00:00:00Z' })],
      finish: { rule_groups: [g(all('w'))] },
    }
    const r = evaluate(graph, cr('w'), '2027-01-01T00:00:00Z')
    expect(r.status.w).toBe('credited')
    expect(r.finished).toBe(true)
  })
  it('redacts: output is only keys and states', () => {
    const r = evaluate(rally, cr('start'), NOW)
    expect(Object.keys(r).sort()).toEqual(['credited', 'eligible', 'finished', 'status', 'unlocked'])
    expect(r.status.finale).toBe('locked')
    expect(JSON.stringify(r)).not.toMatch(/answer|teaser|body|url/i)
  })
  it('ignores credits for unknown missions', () => {
    expect(evaluate(trail, cr('ghost'), NOW).credited).toEqual([])
  })
})

// Small deterministic PRNG so shuffles are reproducible.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
function shuffle<T>(xs: readonly T[], r: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

describe('order independence', () => {
  const graphs: Array<[string, HuntGraph, string[]]> = [
    ['trail', trail, ['start', 'mural', 'garden', 'finish']],
    ['passport', passport, ['start', ...shops]],
    ['rally', rally, ['start', ...shops, 'finale']],
  ]
  it.each(graphs)('%s: shuffled missions and credits give identical output', (_n: string, graph: HuntGraph, keys: string[]) => {
    const r = rng(42)
    for (let i = 0; i < 40; i++) {
      const credits: Credit[] = shuffle(keys, r)
        .filter(() => r() < 0.6)
        .flatMap((k) => (r() < 0.3 ? [{ mission_key: k, bucket: 'alt' }, { mission_key: k }] : [{ mission_key: k }]))
      const base = evaluate(graph, credits, NOW)
      const permuted = evaluate({ ...graph, missions: shuffle(graph.missions, r) }, shuffle(credits, r), NOW)
      expect(permuted).toEqual(base)
      expect(evaluate(graph, credits, NOW)).toEqual(base)
    }
  })
  it('validation is order independent too', () => {
    const r = rng(7)
    const broken: HuntGraph = {
      missions: [m('a', [all('b')]), m('b', [all('a')]), m('c', [all('ghost')]), m('d', [], { open: 'x' })],
      finish: { rule_groups: [g(all('a'))] },
    }
    const base = validateGraph(broken)
    for (let i = 0; i < 20; i++) {
      expect(validateGraph({ ...broken, missions: shuffle(broken.missions, r) })).toEqual(base)
    }
  })
})
