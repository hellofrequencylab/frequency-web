import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { LOOM_PRIMITIVES } from './primitives'
import { loomContext } from './context'
import { MAX_STEPS, validateLoomFunction, type LoomContext } from './validate'

// Arm A of check:loom-integrity (PROG-E9): one good declaration against the REAL context (adopted block
// schemas, the real manifest), then one broken copy per rule, each of which must fail and name why.

const GOOD = {
  id: 'callout-teaser',
  label: 'Callout teaser',
  v: 1,
  input: 'block:callout',
  output: 'text',
  steps: [
    { id: 'clean', op: 'text.trim', args: { value: { field: 'title' } } },
    { id: 'short', op: 'text.truncate', args: { value: { step: 'clean' }, max: { number: 40 } } },
    { id: 'blank', op: 'text.isEmpty', args: { value: { step: 'short' } } },
    { id: 'pick', op: 'logic.choose', args: { when: { step: 'blank' }, then: { text: 'Read more' }, otherwise: { step: 'short' } } },
  ],
  result: 'pick',
  gates: { minRole: 'host' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each case breaks the declaration on purpose
const clone = () => structuredClone(GOOD) as Record<string, any>

function problemsOf(decl: unknown, ctx: LoomContext = loomContext()): string[] {
  const r = validateLoomFunction(decl, ctx)
  return r.ok ? [] : r.problems
}

describe('validateLoomFunction (arm A)', () => {
  it('accepts a well-formed function against the real block schemas and manifest', () => {
    const r = validateLoomFunction(GOOD, loomContext())
    expect(r.ok).toBe(true)
  })

  it('L1: an op that is not a primitive fails', () => {
    const d = clone()
    d.steps[0].op = 'text.eval'
    expect(problemsOf(d).join()).toMatch(/text\.eval is not a Loom primitive/)
  })

  it('L2: a missing, an extra, or a wrongly kinded argument fails', () => {
    const missing = clone()
    delete missing.steps[1].args.max
    expect(problemsOf(missing).join()).toMatch(/needs argument max/)
    const extra = clone()
    extra.steps[0].args.other = { text: 'x' }
    expect(problemsOf(extra).join()).toMatch(/takes no argument other/)
    const kind = clone()
    kind.steps[1].args.max = { text: '40' }
    expect(problemsOf(kind).join()).toMatch(/max must be number, got text/)
  })

  it('L3: an unknown schema, or a field the schema does not have, fails', () => {
    const schema = clone()
    schema.input = 'block:nope'
    expect(problemsOf(schema).join()).toMatch(/block:nope is not a known schema/)
    const field = clone()
    field.steps[0].args.value = { field: 'subtitle' }
    expect(problemsOf(field).join()).toMatch(/block:callout does not have/)
  })

  it('L3: references resolve against the Zod shape, so dropping a field from the schema breaks them', () => {
    const ctx: LoomContext = { primitives: LOOM_PRIMITIVES, schemas: new Map([['block:callout', z.object({ body: z.string().optional() })]]) }
    expect(problemsOf(GOOD, ctx).join()).toMatch(/reads title, which block:callout does not have/)
  })

  it('L4: a forward or self reference, a repeated id and too many steps all fail', () => {
    const forward = clone()
    forward.steps[0].args.value = { step: 'short' }
    expect(problemsOf(forward).join()).toMatch(/reads step short, which is not an earlier step/)
    const dup = clone()
    dup.steps[1].id = 'clean'
    expect(problemsOf(dup).join()).toMatch(/used by an earlier step/)
    const long = clone()
    long.steps = Array.from({ length: MAX_STEPS + 1 }, (_, i) => ({ id: `s${i}`, op: 'text.trim', args: { value: { field: 'title' } } }))
    long.result = 's0'
    expect(problemsOf(long).length).toBeGreaterThan(0)
  })

  it('L5: unknown keys, code-shaped values and unsafe identifiers fail', () => {
    const key = clone()
    key.script = 'return 1'
    expect(problemsOf(key).length).toBeGreaterThan(0)
    const fnValue = clone()
    fnValue.steps[0].args.value = { text: () => 'x' }
    expect(problemsOf(fnValue).length).toBeGreaterThan(0)
    const proto = clone()
    proto.steps[0].args = { __proto__: { field: 'title' } }
    expect(problemsOf(proto).length).toBeGreaterThan(0)
    const expr = clone()
    expr.steps[0].args.value = { field: 'title.constructor' }
    expect(problemsOf(expr).length).toBeGreaterThan(0)
  })

  it('L6: a result whose kind is not the declared output fails', () => {
    const d = clone()
    d.output = 'number'
    expect(problemsOf(d).join()).toMatch(/gives text, but the function declares number/)
    const none = clone()
    none.result = 'ghost'
    expect(problemsOf(none).join()).toMatch(/ghost is not a step/)
  })

  it('L7: a role floor off the ladder fails', () => {
    const d = clone()
    d.gates.minRole = 'owner'
    expect(problemsOf(d).length).toBeGreaterThan(0)
  })

  it('L8: validation is total, reporting every problem and never a partial function', () => {
    const d = clone()
    d.steps[0].op = 'nope'
    d.steps[1].args.max = { boolean: true }
    const r = validateLoomFunction(d, loomContext())
    expect(r.ok).toBe(false)
    expect('fn' in r).toBe(false)
    if (!r.ok) expect(r.problems.length).toBeGreaterThanOrEqual(2)
  })
})
