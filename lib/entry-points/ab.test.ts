import { describe, it, expect } from 'vitest'
import { pickVariant, type EntryVariant } from './ab'

function v(key: string, weight: number, active = true): EntryVariant {
  return { id: key, key, label: key, targetUrl: `/start/${key}`, weight, active }
}

describe('pickVariant', () => {
  it('returns null when there is no active variant', () => {
    expect(pickVariant([])).toBeNull()
    expect(pickVariant([v('a', 1, false)])).toBeNull()
    expect(pickVariant([v('a', 0)])).toBeNull() // weight 0 = inactive in the split
  })

  it('always returns the sole active variant', () => {
    const only = [v('a', 5), v('b', 1, false)]
    expect(pickVariant(only, 0)?.key).toBe('a')
    expect(pickVariant(only, 0.99)?.key).toBe('a')
  })

  it('splits by weight (A:1, B:3 → boundary at 0.25)', () => {
    const vs = [v('a', 1), v('b', 3)]
    expect(pickVariant(vs, 0)?.key).toBe('a')
    expect(pickVariant(vs, 0.2)?.key).toBe('a')
    expect(pickVariant(vs, 0.25)?.key).toBe('b') // 0.25*4 = 1.0 → past A's bucket
    expect(pickVariant(vs, 0.9)?.key).toBe('b')
  })

  it('clamps out-of-range rand and ignores inactive variants', () => {
    const vs = [v('a', 1), v('b', 1), v('c', 1, false)]
    expect(pickVariant(vs, 1)?.key).toBe('b') // clamped to last active
    expect(pickVariant(vs, -1)?.key).toBe('a')
    // c is inactive, never picked
    for (const r of [0, 0.3, 0.49, 0.5, 0.99]) expect(pickVariant(vs, r)?.key).not.toBe('c')
  })

  it('is a roughly fair coin at 50/50 over many draws', () => {
    const vs = [v('a', 1), v('b', 1)]
    let a = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (pickVariant(vs, (i + 0.5) / N)?.key === 'a') a++
    expect(a).toBe(N / 2) // deterministic sweep → exactly half land in A's bucket
  })
})
