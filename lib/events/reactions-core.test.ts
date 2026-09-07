import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { aggregate, isBoopKind, BOOP_KINDS } from './reactions-core'

// `aggregate`'s result crosses the server→client boundary as a server action's return value.
// React Flight refuses a null-prototype object there, and this fold used to return one — the
// production error on /events/[slug] for 69 days (see the module header). The prototype assertion
// is the control: it fails on the old body and passes on the new one.

const rows = [
  { post_id: 'p1', kind: '🔥', profile_id: 'me' },
  { post_id: 'p1', kind: '🔥', profile_id: 'other' },
  { post_id: 'p1', kind: '❤️', profile_id: 'other' },
  { post_id: 'p2', kind: '👋', profile_id: 'me' },
  { post_id: 'p2', kind: 'not-a-boop', profile_id: 'me' },
  { post_id: 'p-not-requested', kind: '🎉', profile_id: 'me' },
]

describe('aggregate', () => {
  it('🔴 returns a PLAIN object — Flight-serializable — never the null-prototype working map', () => {
    const out = aggregate(rows, ['p1', 'p2'], 'me')
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    // The shaped-but-empty path (viewer cannot read the event) crosses the same boundary.
    const empty = aggregate([], ['p1'], null)
    expect(Object.getPrototypeOf(empty)).toBe(Object.prototype)
    expect(empty).toEqual({ p1: { counts: {}, mine: [] } })
  })

  it('folds counts per kind and records which kinds the viewer booped', () => {
    const out = aggregate(rows, ['p1', 'p2'], 'me')
    expect(out.p1).toEqual({ counts: { '🔥': 2, '❤️': 1 }, mine: ['🔥'] })
    expect(out.p2).toEqual({ counts: { '👋': 1 }, mine: ['👋'] })
  })

  it('shapes every requested id, ignores rows for ids not requested, and drops unknown kinds', () => {
    const out = aggregate(rows, ['p1', 'p2', 'p3'], null)
    expect(Object.keys(out).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(out.p3).toEqual({ counts: {}, mine: [] })
    expect(out['p-not-requested']).toBeUndefined()
    expect(out.p2.counts).toEqual({ '👋': 1 })
    expect(out.p2.mine).toEqual([]) // no viewer
  })

  it('never writes a prototype-polluting key, before or after the boundary conversion', () => {
    const out = aggregate([], ['__proto__', 'constructor', 'prototype', 'ok'], null)
    expect(Object.keys(out)).toEqual(['ok'])
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    // Spreading must not have promoted `__proto__` into a real prototype write.
    expect(({} as Record<string, unknown>).counts).toBeUndefined()
  })
})

// ── The WHOLE return tree passes React Flight's own rule, not only its root ──────────────────
//
// LIVE-203 (ADR-1230) re-derived this defect from the error text alone: Flight describes the
// PARENT of the refused value, and a bare `{}` in that message is its `emptyRoot` sentinel, so
// the refused value was a serialisation ROOT (a server action's return value), not a prop nested
// in JSX. That deduction is what four passes of reading the page's render tree could not give.
// The prototype assertion above pins the root; this one walks every nested value with the exact
// predicate the flight server applies (react-server-dom-webpack-server.node.production.js, the
// "Only plain objects" throw), so a null-prototype `counts` bucket, which would be refused with a
// different parent description and therefore a different digest, is a red test too.

/** React Flight's acceptance rule for a non-array object, verbatim from the server build. */
function flightAccepts(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || (proto !== null && Object.getPrototypeOf(proto) === null)
}

/** Every object reachable from `value` that Flight would refuse, as dotted paths. */
function flightRefusals(value: unknown, at = '$'): string[] {
  if (typeof value !== 'object' || value === null) return []
  if (Array.isArray(value)) return value.flatMap((v, i) => flightRefusals(v, `${at}[${i}]`))
  if (value instanceof Date) return []
  const here = flightAccepts(value) ? [] : [at]
  return here.concat(Object.keys(value).flatMap((k) => flightRefusals((value as Record<string, unknown>)[k], `${at}.${k}`)))
}

describe('aggregate crosses the Flight boundary whole (LIVE-203, ADR-1230)', () => {
  it('the predicate is the real one: it refuses exactly what Flight refuses', () => {
    // Positive controls for the walker itself, so a broken walker cannot pass by silence.
    expect(flightRefusals(Object.create(null))).toEqual(['$'])
    expect(flightRefusals({ a: { b: Object.create(null) } })).toEqual(['$.a.b'])
    expect(flightRefusals([{ counts: Object.create(null) }])).toEqual(['$[0].counts'])
    expect(flightRefusals(new (class Row {})())).toEqual(['$'])
    // And accepts what Flight accepts: plain objects, arrays, Dates, primitives.
    expect(flightRefusals({ a: [1, 'x', null, new Date(0), { b: {} }] })).toEqual([])
  })

  it('🔴 the pre-fix shape (a null-prototype map at the root) is refused by that predicate', () => {
    const preFix = Object.assign(Object.create(null), { p1: { counts: {}, mine: [] } })
    expect(flightRefusals(preFix)).toEqual(['$'])
  })

  it('no value anywhere in the fold result is refused, on every path the action can return', () => {
    // The populated path, the shaped-but-empty path (viewer cannot read the event), the
    // unsafe-key path, and the no-ids path: each is a return value of getEventPostReactions.
    expect(flightRefusals(aggregate(rows, ['p1', 'p2'], 'me'))).toEqual([])
    expect(flightRefusals(aggregate([], ['p1'], null))).toEqual([])
    expect(flightRefusals(aggregate(rows, ['__proto__', 'p1'], 'me'))).toEqual([])
    expect(flightRefusals(aggregate([], [], null))).toEqual([])
  })
})

describe('the reaction set', () => {
  it('accepts exactly the five faces and nothing else', () => {
    for (const k of BOOP_KINDS) expect(isBoopKind(k)).toBe(true)
    expect(isBoopKind('👍')).toBe(false)
    expect(isBoopKind('')).toBe(false)
  })
})

// ── The server module consumes the core and no longer builds a null-proto return itself ────────

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('lib/events/reactions.ts stays a thin `use server` surface over the core', () => {
  const SRC = read('lib/events/reactions.ts')

  it("is still a 'use server' module whose fold comes from the core", () => {
    expect(SRC.startsWith("'use server'")).toBe(true)
    expect(SRC).toContain("from './reactions-core'")
    expect(SRC).toContain("export type { BoopKind, PostReactions } from './reactions-core'")
  })

  it('carries no null-prototype construction of its own (the boundary bug cannot come back here)', () => {
    expect(SRC).not.toContain('Object.create(null)')
  })

  it('the client reads the types from the same path it always did', () => {
    const CLIENT = read('components/events/event-activity.tsx')
    expect(CLIENT).toContain("import type { BoopKind, PostReactions } from '@/lib/events/reactions'")
    // And the swallow that hid this for 69 days now reports.
    expect(CLIENT).toContain("console.error('[event-activity] reactions read failed'")
  })
})
