import { describe, it, expect } from 'vitest'
import { sanitizeProps } from './sanitize'

// Locks the prop-bag allowlist. The bag is built from attacker-influenced KEY names as well
// as values, so the key tests matter as much as the value ones.

describe('sanitizeProps', () => {
  it('keeps primitives and drops everything else', () => {
    expect(sanitizeProps({ a: 'x', b: 2, c: true, d: null, e: {}, f: [] })).toEqual({
      a: 'x',
      b: 2,
      c: true,
    })
  })

  it('caps key count and string length', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(sanitizeProps(many)).length).toBe(20)
    expect(sanitizeProps({ s: 'x'.repeat(900) }).s).toHaveLength(500)
  })

  it('drops machinery keys rather than writing them', () => {
    // Not a live pollution hole -- assigning a string to __proto__ does not replace the
    // prototype -- but the write silently did nothing and the key vanished, which corrupts
    // the row. Now it is dropped on purpose.
    const out = sanitizeProps(JSON.parse('{"__proto__":"x","constructor":"y","ok":"z"}'))
    expect(out).toEqual({ ok: 'z' })
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })

  it('treats non-objects as an empty bag', () => {
    for (const v of [null, undefined, 'str', 7, true]) expect(sanitizeProps(v)).toEqual({})
  })
})
