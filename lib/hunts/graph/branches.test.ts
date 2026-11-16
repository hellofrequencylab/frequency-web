import { describe, expect, it } from 'vitest'
import { MAX_CHOICE_PATHS } from './branches'
import { evaluate, validateGraph } from './index'
import type { Credit, HuntGraph, Mission, RuleGroup } from './index'

const NOW = '2026-12-01T12:00:00Z'
const all = (...members: string[]): RuleGroup => ({ logic: 'all', members })
const any = (...members: string[]): RuleGroup => ({ logic: 'any', members })
const m = (key: string, groups: RuleGroup[] = [], extra: Partial<Mission> = {}): Mission => ({ mission_key: key, rule_groups: groups, ...extra })
const cr = (...keys: string[]): Credit[] => keys.map((mission_key) => ({ mission_key }))
const codes = (graph: HuntGraph) => validateGraph(graph).blockers.map((b) => b.code)

/** A fork: after `start` take the river or the ridge, each with its own second stop, then meet at `end`. */
const fork = (extra: Mission[] = [], finish: RuleGroup[] = [all('end')]): HuntGraph => ({
  missions: [
    m('start'),
    m('river', [all('start')], { choice_group: 'way' }),
    m('ridge', [all('start')], { choice_group: 'way' }),
    m('river-2', [all('river')]),
    m('ridge-2', [all('ridge')]),
    m('end', [any('river-2', 'ridge-2')]),
    ...extra,
  ],
  finish: { rule_groups: finish },
})

describe('exclusive choice', () => {
  it('offers every branch until one is chosen', () => {
    const ev = evaluate(fork(), cr('start'), NOW)
    expect(ev.eligible).toEqual(['ridge', 'river'])
  })

  it('closes the other branch once one is credited, and keeps its path locked', () => {
    const ev = evaluate(fork(), cr('start', 'river'), NOW)
    expect(ev.status).toMatchObject({ river: 'credited', ridge: 'closed', 'river-2': 'eligible', 'ridge-2': 'locked' })
    expect(ev.eligible).toEqual(['river-2'])
  })

  it('lets both valid choices finish', () => {
    expect(validateGraph(fork())).toEqual({ ok: true, blockers: [] })
    expect(evaluate(fork(), cr('start', 'river', 'river-2', 'end'), NOW).finished).toBe(true)
    expect(evaluate(fork(), cr('start', 'ridge', 'ridge-2', 'end'), NOW).finished).toBe(true)
  })

  it('is immutable: a later credit for the other branch never counts and never changes the choice', () => {
    const credits: Credit[] = [
      { mission_key: 'start', at: '2026-12-01T09:00:00Z' },
      { mission_key: 'river', at: '2026-12-01T10:00:00Z' },
      { mission_key: 'ridge', at: '2026-12-01T11:00:00Z' },
    ]
    const ev = evaluate(fork(), credits, NOW)
    expect(ev.credited).toEqual(['river', 'start'])
    expect(ev.status).toMatchObject({ river: 'credited', ridge: 'closed', 'ridge-2': 'locked', 'river-2': 'eligible' })
    // Same answer whatever order the rows arrive in.
    expect(evaluate(fork(), [...credits].reverse(), NOW)).toEqual(ev)
  })

  it('reads database timestamps with an offset, and the earlier instant wins whatever its key', () => {
    const credits: Credit[] = [
      { mission_key: 'river', at: '2026-12-01T11:00:00+00:00' },
      { mission_key: 'ridge', at: '2026-12-01T12:30:00+02:00' },
    ]
    expect(evaluate(fork(), credits, NOW).status).toMatchObject({ ridge: 'credited', river: 'closed' })
  })

  it('breaks an exact tie, or an unknown time, by the lower key, the same way every time', () => {
    const same = '2026-12-01T10:00:00Z'
    expect(evaluate(fork(), [{ mission_key: 'river', at: same }, { mission_key: 'ridge', at: same }], NOW).status.ridge).toBe('credited')
    expect(evaluate(fork(), cr('river', 'ridge'), NOW).status).toMatchObject({ ridge: 'credited', river: 'closed' })
    // A credit with a known time beats one without.
    expect(evaluate(fork(), [{ mission_key: 'river', at: same }, { mission_key: 'ridge' }], NOW).status.river).toBe('credited')
  })

  it('does not let the unchosen branch count toward a threshold', () => {
    const graph = fork([], [{ logic: 'count', min_count: 2, members: ['river', 'ridge', 'start'] }])
    expect(evaluate(graph, cr('river', 'ridge'), NOW).finished).toBe(false)
    expect(evaluate(graph, cr('river', 'ridge', 'start'), NOW).finished).toBe(true)
  })

  it('reopens the choice when the chosen credit is no longer among the credits (a staff reversal)', () => {
    expect(evaluate(fork(), cr('start'), NOW).eligible).toEqual(['ridge', 'river'])
  })
})

describe('publish: every choice can finish', () => {
  it('refuses a branch that leads nowhere and names the choice', () => {
    const graph: HuntGraph = {
      missions: [m('start'), m('river', [all('start')], { choice_group: 'way' }), m('ridge', [all('start')], { choice_group: 'way' }), m('end', [all('river')])],
      finish: { rule_groups: [all('end')] },
    }
    const r = validateGraph(graph)
    expect(r.blockers.map((b) => b.code)).toEqual(['BRANCH_DEAD_END'])
    expect(r.blockers[0].mission_keys).toEqual(['ridge'])
  })

  it('refuses a finish that needs both branches of one choice', () => {
    expect(codes(fork([], [all('river-2', 'ridge-2')]))).toEqual(['FINISH_UNREACHABLE'])
  })

  it('checks choices together: a first pick that strands every option of a later choice is a dead end', () => {
    const graph: HuntGraph = {
      missions: [
        m('a1', [], { choice_group: 'first' }),
        m('a2', [], { choice_group: 'first' }),
        // Both options of the second choice need a1, so a player who took a2 can never choose again.
        m('b1', [all('a1')], { choice_group: 'second' }),
        m('b2', [all('a1')], { choice_group: 'second' }),
      ],
      finish: { rule_groups: [any('b1', 'b2')] },
    }
    const r = validateGraph(graph)
    expect(r.blockers.map((b) => b.code)).toEqual(['BRANCH_DEAD_END'])
    expect(r.blockers[0].mission_keys).toEqual(['a2'])
  })

  it('accepts two independent choices when every combination finishes', () => {
    const graph: HuntGraph = {
      missions: [
        m('a1', [], { choice_group: 'first' }), m('a2', [], { choice_group: 'first' }),
        m('b1', [any('a1', 'a2')], { choice_group: 'second' }), m('b2', [any('a1', 'a2')], { choice_group: 'second' }),
      ],
      finish: { rule_groups: [any('b1', 'b2')] },
    }
    expect(validateGraph(graph).ok).toBe(true)
  })

  it('needs one free way through, not a free version of every branch', () => {
    const paidRidge = fork().missions.map((x) => (x.mission_key === 'ridge' ? { ...x, requires_entitlement: true } : x))
    expect(validateGraph({ ...fork(), missions: paidRidge }).ok).toBe(true)
    const allPaid = fork().missions.map((x) => (x.choice_group ? { ...x, requires_entitlement: true } : x))
    expect(codes({ ...fork(), missions: allPaid })).toEqual(['NO_FREE_PATH'])
  })

  it('bounds the paths it will check', () => {
    const groups = Array.from({ length: 7 }, (_, i) => [m(`g${i}-a`, [], { choice_group: `g${i}` }), m(`g${i}-b`, [], { choice_group: `g${i}` })]).flat()
    expect(2 ** 7).toBeGreaterThan(MAX_CHOICE_PATHS)
    const r = validateGraph({ missions: groups, finish: { rule_groups: [any('g0-a', 'g0-b')] } })
    expect(r.blockers.map((b) => b.code)).toEqual(['CHOICE_LIMIT'])
    const six = groups.slice(0, 12)
    expect(validateGraph({ missions: six, finish: { rule_groups: [any('g0-a', 'g0-b')] } }).ok).toBe(true)
  })

  it('refuses a group of one and a mission in both kinds of group', () => {
    expect(codes({ missions: [m('a', [], { choice_group: 'solo' })], finish: { rule_groups: [all('a')] } })).toEqual(['BRANCH_INVALID'])
    const both = { missions: [m('a', [], { choice_group: 'c', fallback_group: 'f' }), m('b', [], { choice_group: 'c', fallback_group: 'f' })], finish: { rule_groups: [any('a', 'b')] } }
    expect(new Set(codes(both))).toEqual(new Set(['BRANCH_INVALID']))
  })

  it('checks each regional chapter against the choices too', () => {
    const graph: HuntGraph = {
      ...fork(),
      chapters: [{ chapter_key: 'water', enabled: true, members: ['river', 'river-2'] }, { chapter_key: 'hill', enabled: true, members: ['ridge'] }],
    }
    // ridge-2 is shared, so the hill chapter can finish; take it away and it cannot.
    expect(validateGraph(graph).ok).toBe(true)
    const cut: HuntGraph = { ...graph, chapters: [{ chapter_key: 'water', enabled: true, members: ['river', 'river-2', 'ridge-2'] }, { chapter_key: 'hill', enabled: true, members: ['ridge'] }] }
    expect(codes(cut)).toEqual(['CHAPTER_INFEASIBLE'])
  })
})

describe('fallback and the alternative path', () => {
  /** A Mystery with a staffed desk as its alternative, then the last stop. */
  const mystery = (fallback = true): HuntGraph => ({
    missions: [
      m('start'),
      m('riddle', [all('start')], { kind: 'answer', ...(fallback ? { fallback_group: 'riddle' } : {}) }),
      ...(fallback ? [m('riddle-desk', [all('start')], { fallback_group: 'riddle' })] : []),
      m('end', [all('riddle')]),
    ],
    finish: { rule_groups: [all('end')] },
  })

  it('accepts a Mystery that has a fallback and refuses one that does not', () => {
    expect(validateGraph(mystery())).toEqual({ ok: true, blockers: [] })
    const r = validateGraph(mystery(false))
    expect(r.blockers.map((b) => b.code)).toEqual(['MYSTERY_NO_FALLBACK'])
    expect(r.blockers[0].mission_keys).toEqual(['riddle'])
  })

  it('accepts a Mystery off the route to the finish without a fallback', () => {
    const side: HuntGraph = { missions: [m('start'), m('bonus', [all('start')], { kind: 'answer' })], finish: { rule_groups: [all('start')] } }
    expect(validateGraph(side).ok).toBe(true)
  })

  it('refuses a fallback that is itself an answer', () => {
    const graph = mystery()
    const both = graph.missions.map((x) => (x.mission_key === 'riddle-desk' ? { ...x, kind: 'answer' } : x))
    expect(codes({ ...graph, missions: both })).toEqual(['MYSTERY_NO_FALLBACK'])
  })

  it('lets the fallback stand in for the answer: the path beyond unlocks and the answer closes', () => {
    const before = evaluate(mystery(), cr('start'), NOW)
    expect(before.eligible).toEqual(['riddle', 'riddle-desk'])
    const ev = evaluate(mystery(), cr('start', 'riddle-desk'), NOW)
    expect(ev.status).toMatchObject({ 'riddle-desk': 'credited', riddle: 'closed', end: 'eligible' })
    expect(evaluate(mystery(), cr('start', 'riddle-desk', 'end'), NOW).finished).toBe(true)
  })

  it('never counts the answer and its fallback twice', () => {
    const graph: HuntGraph = {
      missions: [m('riddle', [], { kind: 'answer', fallback_group: 'r' }), m('riddle-desk', [], { fallback_group: 'r' }), m('other')],
      finish: { rule_groups: [{ logic: 'count', min_count: 2, members: ['riddle', 'riddle-desk', 'other'] }] },
    }
    expect(validateGraph(graph).ok).toBe(true)
    const ev = evaluate(graph, cr('riddle', 'riddle-desk'), NOW)
    expect(ev.credited).toHaveLength(1)
    expect(ev.finished).toBe(false)
    expect(evaluate(graph, cr('riddle-desk', 'other'), NOW).finished).toBe(true)
    // The validator counts the pair once as well: 3 of these 3 can never happen.
    const three: HuntGraph = { ...graph, finish: { rule_groups: [{ logic: 'count', min_count: 3, members: ['riddle', 'riddle-desk', 'other'] }] } }
    expect(validateGraph(three).ok).toBe(false)
  })

  it('keeps a Mystery inside a choice finishable on both sides', () => {
    const graph = fork([m('river-riddle', [all('river')], { kind: 'answer' })]).missions
    const needsRiddle = graph.map((x) => (x.mission_key === 'river-2' ? { ...x, rule_groups: [all('river-riddle')] } : x))
    const r = validateGraph({ missions: needsRiddle, finish: { rule_groups: [all('end')] } })
    expect(r.blockers.map((b) => b.code)).toEqual(['MYSTERY_NO_FALLBACK'])
  })
})
