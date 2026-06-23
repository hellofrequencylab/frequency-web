import { describe, it, expect } from 'vitest'
import { phaseUnlockAt, isPhaseUnlocked, unlockedPhaseCount } from './schedule'

const start = new Date('2026-01-01T00:00:00Z')
const day = (n: number) => new Date(start.getTime() + n * 86_400_000)

describe('journey phase drip schedule (ADR-252)', () => {
  it('phase 0 opens at the start; later phases one interval apart', () => {
    expect(phaseUnlockAt(start, 0, 7).getTime()).toBe(start.getTime())
    expect(phaseUnlockAt(start, 1, 7).getTime()).toBe(day(7).getTime())
    expect(phaseUnlockAt(start, 3, 7).getTime()).toBe(day(21).getTime())
  })

  it('isPhaseUnlocked respects the weekly cadence', () => {
    expect(isPhaseUnlocked(start, 0, 7, start)).toBe(true) // first phase open immediately
    expect(isPhaseUnlocked(start, 1, 7, day(6))).toBe(false) // day 6: phase 2 still locked
    expect(isPhaseUnlocked(start, 1, 7, day(7))).toBe(true) // day 7: phase 2 unlocks
  })

  it('unlockedPhaseCount counts opened phases, clamped to the total', () => {
    expect(unlockedPhaseCount(start, 7, 5, start)).toBe(1) // day 0 → only phase 1
    expect(unlockedPhaseCount(start, 7, 5, day(7))).toBe(2) // day 7 → 2 phases
    expect(unlockedPhaseCount(start, 7, 5, day(28))).toBe(5) // day 28 → all 5 (capped)
    expect(unlockedPhaseCount(start, 7, 5, day(100))).toBe(5) // never exceeds total
  })

  it('interval 0 means everything is open (no drip)', () => {
    expect(unlockedPhaseCount(start, 0, 4, start)).toBe(4)
  })
})
