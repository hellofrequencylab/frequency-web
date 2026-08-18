// The static half of the accessibility ratchet, tested against BROKEN FIXTURES and the REAL TREE.
//
// `check-a11y-baselines.mjs` exists because the runtime gate can only judge a surface it has just
// measured, and measuring needs a browser, a deployment and a seeded member account. Everything
// that lives in the FILE instead — is this number a reading or a ceiling? does the ceiling say
// why? did somebody raise it without writing a reason? — had no gate at all until 2026-08-17.
//
// A guard is worth exactly what its failure modes are worth, so every arm below is driven with a
// fixture that MUST fail. The two that matter most are the hand-edit guard in both directions:
// a number that moved without its provenance moving is the mechanism that makes "a raise must
// carry a written reason" true rather than customary.
//
// This file is the declared VITEST_ENFORCED home for `check:a11y-baselines`
// (scripts/guard-wiring.test.ts), so it must import the guard module directly — and it asserts
// against the tree as committed, not only against fixtures, so it cannot stand in for enforcement
// while enforcing nothing.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCeilingEntry, validate } from './check-a11y-baselines.mjs'
import { type CeilingEntry, isCeilingEntry as isCeilingEntryRuntime } from '../test/e2e/a11y-ratchet'
import { ceilingFixture } from '../test/e2e/a11y-ratchet.test'

type Entry = ReturnType<typeof ceilingFixture> | number

/** A minimally-valid document. The guard refuses anything under MIN_SURFACES on the grounds that
 *  a ✓ printed over four contexts looks exactly like a ✓ printed over forty-nine (ADR-962). */
function docWith(entries: Record<string, Entry | unknown>): unknown {
  const surfaces: Record<string, unknown> = {}
  for (let i = 0; i < 45; i++) surfaces[`/filler-${i} [dawn-light, desktop]`] = 0
  return { $defaultMax: 0, surfaces: { ...surfaces, ...entries } }
}

const CONTEXT = '/feed [dawn-light, desktop]'
const problemsOf = (doc: unknown): string => validate(doc).problems.join('\n')

describe('the file that actually ships', () => {
  const shipped = JSON.parse(readFileSync(join('test', 'e2e', 'a11y-baselines.json'), 'utf8'))

  it('passes the guard', () => {
    expect(problemsOf(shipped)).toBe('')
  })

  it('holds 40+ contexts, so the pass above is not a pass over nothing', () => {
    expect(Object.keys(shipped.surfaces).length).toBeGreaterThanOrEqual(40)
  })

  // Not incidental. If a future edit widens the ceiling set, this is the line that makes somebody
  // look at it — a ceiling is headroom a regression can hide in, and the set of them should only
  // ever shrink. It did its job on 2026-08-18: the eight OWN-014 entries below were added and this
  // assertion failed in CI until they were named here on purpose.
  //
  // 🔴 ZERO CEILINGS, AND THAT IS THE POINT OF LIVE-023.
  //
  // This assertion has now fired three times in one night, each time because the waiver list
  // CHANGED, and each change was a tightening:
  //   11 → 3  a capture replaced the eight OWN-014 amber waivers with readings.
  //    3 → 0  the member session finally minted (OWN-002/OWN-003), so /feed, /settings, /nearby
  //           and the Space console were measured for the first time — all twelve contexts at 0 —
  //           and the three placeholders that existed only because "nothing has measured these
  //           surfaces honestly" stopped being needed.
  //
  // A ceiling is headroom a regression can sit in while this prints a tick. There is none left:
  // every one of the 52 contexts is held to EQUALITY, so a rise fails and a fall fails too.
  // Keep it that way. If a future change wants a ceiling back, it has to argue for it here, and
  // the only honest argument is the one LIVE-023 made — that nothing has measured the surface.
  it('declares NO ceilings at all: every context is held to equality', () => {
    const { ceilings, readings } = validate(shipped)
    expect(ceilings.map((c: { context: string }) => c.context).sort()).toEqual([])
    // Non-vacuity: an empty ceiling list means nothing unless the readings are real and numerous.
    // 50, against 52 measured on 2026-08-18 — up from a floor of 38 when eight contexts were
    // waived and the member shell was unmeasured. `readings` is a COUNT, not an array.
    expect(readings).toBeGreaterThanOrEqual(50)
  })

  it('every ceiling names what would retire it, so none of them is permanent', () => {
    // The guard is plain node, so its JSDoc types `entry` as a bare object; the shape it just
    // validated is exactly CeilingEntry, which is what these two assertions read off.
    const ceilings = validate(shipped).ceilings as unknown as { entry: CeilingEntry }[]
    for (const { entry } of ceilings) {
      expect(entry.retiredBy).toMatch(/PW_A11Y_UPDATE=1/)
      expect(entry.why).toMatch(/[Nn]ot a reading/)
    }
  })
})

describe('a number cannot move without a written reason', () => {
  it('accepts an honest ceiling', () => {
    expect(problemsOf(docWith({ [CONTEXT]: ceilingFixture(12) }))).toBe('')
  })

  // THE HAND-EDIT GUARD, in BOTH directions. `frozen.value` and `ceiling` are two statements of
  // the same fact, so editing one alone is a contradiction the guard can see. This is the rule
  // scripts/check-adoption.mjs added after a blind `--update` laundered a 494 → 529 raise into a
  // green board; the a11y file had the identical hole and no such rule.
  it('FAILS when the ceiling is RAISED and the provenance is left alone', () => {
    expect(problemsOf(docWith({ [CONTEXT]: { ...ceilingFixture(12), ceiling: 20 } }))).toContain(
      'frozen.value',
    )
  })

  it('FAILS when the ceiling is LOWERED and the provenance is left alone', () => {
    expect(problemsOf(docWith({ [CONTEXT]: { ...ceilingFixture(12), ceiling: 3 } }))).toContain(
      'frozen.value',
    )
  })

  it('FAILS when a raise is filed as a lowering', () => {
    const base = ceilingFixture(12)
    const change = {
      at: '2026-08-17',
      value: 20,
      from: 12,
      direction: 'lowered',
      reason: 'A regression accepted while the fix is scheduled; tracked under its own backlog row.',
    }
    const laundered = { ...base, ceiling: 20, frozen: change, history: [base.frozen, change] }
    expect(problemsOf(docWith({ [CONTEXT]: laundered }))).toContain('is a "raised"')
  })

  it('FAILS when a raise carries no reason worth reading', () => {
    const base = ceilingFixture(12)
    const change = { at: '2026-08-17', value: 20, from: 12, direction: 'raised', reason: 'meh' }
    const bare = { ...base, ceiling: 20, frozen: change, history: [base.frozen, change] }
    expect(problemsOf(docWith({ [CONTEXT]: bare }))).toContain('written reason')
  })

  it('FAILS when the history chain is broken, so no step is attributable', () => {
    const base = ceilingFixture(12)
    const change = {
      at: '2026-08-17',
      value: 20,
      from: 5, // never a value this entry held
      direction: 'raised',
      reason: 'A regression accepted while the fix is scheduled; tracked under its own backlog row.',
    }
    const broken = { ...base, ceiling: 20, frozen: change, history: [base.frozen, change] }
    expect(problemsOf(docWith({ [CONTEXT]: broken }))).toContain('the chain is broken')
  })

  it('FAILS when frozen and the last history step disagree', () => {
    const base = ceilingFixture(12)
    const drifted = { ...base, frozen: { ...base.frozen, reason: base.frozen.reason + ' (edited)' } }
    expect(problemsOf(docWith({ [CONTEXT]: drifted }))).toContain('history.at(-1)')
  })

  it('FAILS on a re-freeze at the same number, which records nothing', () => {
    const base = ceilingFixture(12)
    const noop = {
      at: '2026-08-17',
      value: 12,
      from: 12,
      direction: 'raised',
      reason: 'Re-frozen without anything changing, which is not a change anybody can review.',
    }
    const doc = { ...base, frozen: noop, history: [base.frozen, noop] }
    expect(problemsOf(docWith({ [CONTEXT]: doc }))).toContain('records nothing')
  })
})

describe('a ceiling has to declare itself, and say what is missing', () => {
  it('FAILS when a ceiling does not say why it is not a reading', () => {
    expect(problemsOf(docWith({ [CONTEXT]: { ...ceilingFixture(12), why: 'legacy' } }))).toContain(
      '.why',
    )
  })

  it('FAILS when a ceiling has no way to be retired', () => {
    const { retiredBy: _dropped, ...rest } = ceilingFixture(12)
    expect(problemsOf(docWith({ [CONTEXT]: rest }))).toContain('retiredBy')
  })

  it('FAILS on a value that is neither a reading nor a declared ceiling', () => {
    expect(problemsOf(docWith({ [CONTEXT]: 'lots' }))).toContain('either a bare integer')
    expect(problemsOf(docWith({ [CONTEXT]: -1 }))).toContain('not a count')
    expect(problemsOf(docWith({ [CONTEXT]: 1.5 }))).toContain('not a count')
  })

  it('FAILS on an unknown key, so a ceiling cannot grow a field nothing checks', () => {
    expect(problemsOf(docWith({ [CONTEXT]: { ...ceilingFixture(12), grandfathered: true } }))).toContain(
      'unknown key',
    )
  })

  it('FAILS when the file is truncated to a handful of contexts', () => {
    expect(problemsOf({ $defaultMax: 0, surfaces: { [CONTEXT]: 1 } })).toContain('looks truncated')
  })
})

// Two definitions of one word is how a guard ends up policing a shape nothing else uses. The
// static gate is plain node (so it runs anywhere) and the runtime gate is TypeScript (so the
// Playwright spec can import it); they must still agree on which entries are exceptions.
describe('the static gate and the runtime gate agree on what a ceiling is', () => {
  const fixtures: unknown[] = [
    0,
    12,
    ceilingFixture(12),
    { ceiling: 12 },
    {},
    { value: 12 },
    null,
    undefined,
    [12],
    'ceiling',
  ]

  it.each(fixtures.map((f, i) => [i, f] as const))('fixture %i classifies identically', (_i, f) => {
    expect(isCeilingEntry(f)).toBe(isCeilingEntryRuntime(f))
  })

  it('and at least one fixture is a ceiling, so the agreement is not vacuous', () => {
    expect(fixtures.filter((f) => isCeilingEntry(f)).length).toBeGreaterThan(0)
    expect(fixtures.filter((f) => !isCeilingEntry(f)).length).toBeGreaterThan(0)
  })
})
