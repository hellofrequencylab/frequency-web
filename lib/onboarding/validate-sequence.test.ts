import { describe, it, expect } from 'vitest'
import { validateSequenceDef } from './validate-sequence'
import { DEFAULT_ONBOARDING_SEQUENCE } from './default-sequence'
import type { SequenceDef, SequenceStep } from './sequence-schema'

// The pure semantic gate on a managed flow. These lock the exact rules the resolver depends on, so
// an invalid flow can never reach the `approved`/`final` statuses that serve live members.

/** A minimal valid flow: one non-terminal step + a terminal review step naming the action. */
function validDef(steps?: SequenceStep[]): SequenceDef {
  return {
    key: 'test-flow',
    label: 'Test flow',
    steps: steps ?? [
      { id: 'identity', type: 'identity', label: 'You' },
      { id: 'review', type: 'review', label: 'Review', action: 'completeOnboarding' },
    ],
  }
}

describe('validateSequenceDef', () => {
  it('accepts the code default onboarding sequence', () => {
    expect(validateSequenceDef(DEFAULT_ONBOARDING_SEQUENCE)).toEqual({ ok: true })
  })

  it('accepts a minimal well-formed flow', () => {
    expect(validateSequenceDef(validDef())).toEqual({ ok: true })
  })

  it('rejects an empty steps array', () => {
    const res = validateSequenceDef(validDef([]))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors[0]).toMatch(/at least one step/i)
  })

  it('rejects an unknown step type', () => {
    const res = validateSequenceDef(
      validDef([
        { id: 'mystery', type: 'not-a-real-type' },
        { id: 'review', type: 'review', action: 'completeOnboarding' },
      ]),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => /unknown step type/i.test(e))).toBe(true)
  })

  it('rejects duplicate step ids (once per collision)', () => {
    const res = validateSequenceDef(
      validDef([
        { id: 'dupe', type: 'identity' },
        { id: 'dupe', type: 'profile' },
        { id: 'review', type: 'review', action: 'completeOnboarding' },
      ]),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) {
      const dupeErrors = res.errors.filter((e) => /"dupe"/.test(e) && /unique/i.test(e))
      expect(dupeErrors).toHaveLength(1)
    }
  })

  it('rejects an unknown terminal action key', () => {
    const res = validateSequenceDef(
      validDef([
        { id: 'identity', type: 'identity' },
        { id: 'review', type: 'review', action: 'doSomethingUnregistered' },
      ]),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => /unknown terminal action/i.test(e))).toBe(true)
  })

  it('rejects a flow with no terminal action', () => {
    const res = validateSequenceDef(
      validDef([
        { id: 'identity', type: 'identity' },
        { id: 'review', type: 'review' },
      ]),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => /no terminal action/i.test(e))).toBe(true)
  })

  it('rejects more than one terminal action', () => {
    const res = validateSequenceDef(
      validDef([
        { id: 'identity', type: 'identity', action: 'completeOnboarding' },
        { id: 'review', type: 'review', action: 'completeOnboarding' },
      ]),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => /only one step/i.test(e))).toBe(true)
  })

  it('rejects a terminal action that is not on the last step', () => {
    const res = validateSequenceDef(
      validDef([
        { id: 'identity', type: 'identity', action: 'completeOnboarding' },
        { id: 'review', type: 'review' },
      ]),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.some((e) => /must be on the last step/i.test(e))).toBe(true)
  })

  it('collects multiple independent errors', () => {
    const res = validateSequenceDef(
      validDef([
        { id: 'same', type: 'identity' },
        { id: 'same', type: 'bogus-type' },
      ]),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.length).toBeGreaterThan(1)
  })
})
