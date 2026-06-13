import { describe, it, expect } from 'vitest'
import { z, parseInput, uuid, requiredText, positiveIntAmount } from '@/lib/validation'

const UUID = '00000000-0000-4000-a000-000000000001'

describe('parseInput', () => {
  const schema = z.object({ id: uuid, n: positiveIntAmount(100), reason: requiredText('Reason is required') })

  it('returns the parsed value on valid input', () => {
    expect(parseInput(schema, { id: UUID, n: 5, reason: '  hi ' })).toEqual({ id: UUID, n: 5, reason: 'hi' })
  })

  it('throws a concise, path-prefixed error on invalid input', () => {
    expect(() => parseInput(schema, { id: 'nope', n: 5, reason: 'x' })).toThrow(/^id: /)
    expect(() => parseInput(schema, { id: UUID, n: 5, reason: '   ' })).toThrow('reason: Reason is required')
    expect(() => parseInput(schema, { id: UUID, n: 0, reason: 'x' })).toThrow('n: Invalid amount')
  })
})

describe('positiveIntAmount (mirrors Math.floor + 0<n<=max)', () => {
  const amt = positiveIntAmount(100_000)
  const ok = (v: number) => amt.parse(v)
  const bad = (v: number) => amt.safeParse(v).success === false

  it('floors fractional input (faithful to prior behaviour)', () => {
    expect(ok(5.9)).toBe(5)
    expect(ok(1)).toBe(1)
    expect(ok(100_000)).toBe(100_000)
  })

  it('rejects ≤0, >max, NaN, Infinity', () => {
    expect(bad(0)).toBe(true)
    expect(bad(-3)).toBe(true)
    expect(bad(100_001)).toBe(true)
    expect(bad(Number.NaN)).toBe(true)
    expect(bad(Number.POSITIVE_INFINITY)).toBe(true)
  })
})

describe('uuid / requiredText', () => {
  it('uuid accepts a uuid, rejects junk', () => {
    expect(uuid.parse(UUID)).toBe(UUID)
    expect(uuid.safeParse('not-a-uuid').success).toBe(false)
  })

  it('requiredText trims and requires non-empty', () => {
    expect(requiredText().parse('  hi ')).toBe('hi')
    expect(requiredText().safeParse('   ').success).toBe(false)
  })
})
