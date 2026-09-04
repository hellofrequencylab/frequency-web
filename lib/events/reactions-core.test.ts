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
