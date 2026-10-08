import { describe, it, expect } from 'vitest'
import { phaseUnlockAt, isPhaseUnlocked, unlockedPhaseCount, phaseLockStates, unlockLine, ongoingCycle, MONTHLY_DRIP_DAYS } from './schedule'

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

  it('phaseLockStates locks only the phases the anchor has not reached', () => {
    const states = phaseLockStates(3, start, 7, day(8))
    expect(states.map((s) => s.locked)).toEqual([false, false, true])
    expect(states[2].unlockAt?.getTime()).toBe(day(14).getTime())
  })

  it('phaseLockStates opens everything without an anchor', () => {
    expect(phaseLockStates(2, null, 7)).toEqual([
      { locked: false, unlockAt: null },
      { locked: false, unlockAt: null },
    ])
  })

  it('unlockLine names how long until a phase opens', () => {
    expect(unlockLine(null)).toBe('Locked')
    expect(unlockLine(day(1), start)).toMatch(/^Opens tomorrow · /)
    expect(unlockLine(day(5), start)).toMatch(/^Opens in 5 days · /)
    expect(unlockLine(start, day(1))).toBe('Opening now')
  })

  it('a 30 day cadence opens on the same day of each calendar month', () => {
    const jan31 = new Date('2027-01-31T08:00:00Z')
    expect(phaseUnlockAt(start, 1, MONTHLY_DRIP_DAYS).toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(phaseUnlockAt(start, 11, MONTHLY_DRIP_DAYS).toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(phaseUnlockAt(jan31, 1, MONTHLY_DRIP_DAYS).toISOString()).toBe('2027-02-28T08:00:00.000Z') // clamped
    expect(isPhaseUnlocked(start, 1, MONTHLY_DRIP_DAYS, new Date('2026-01-31T23:59:59Z'))).toBe(false)
    expect(isPhaseUnlocked(start, 1, MONTHLY_DRIP_DAYS, new Date('2026-02-01T00:00:00Z'))).toBe(true)
    expect(unlockedPhaseCount(start, MONTHLY_DRIP_DAYS, 12, new Date('2026-03-15T00:00:00Z'))).toBe(3)
    expect(unlockedPhaseCount(start, MONTHLY_DRIP_DAYS, 12, new Date('2028-01-01T00:00:00Z'))).toBe(12)
  })

  it('ongoingCycle wraps to month 1 of year 2 after the last phase', () => {
    expect(ongoingCycle(start, MONTHLY_DRIP_DAYS, 12, new Date('2026-01-10T00:00:00Z'))).toMatchObject({ year: 1, phaseIndex: 0 })
    expect(ongoingCycle(start, MONTHLY_DRIP_DAYS, 12, new Date('2026-12-31T00:00:00Z'))).toMatchObject({ year: 1, phaseIndex: 11 })
    expect(ongoingCycle(start, MONTHLY_DRIP_DAYS, 12, new Date('2027-01-01T00:00:00Z'))).toMatchObject({ year: 2, phaseIndex: 0 })
    expect(ongoingCycle(start, MONTHLY_DRIP_DAYS, 12, new Date('2027-05-02T00:00:00Z'))).toMatchObject({ year: 2, phaseIndex: 4 })
    expect(ongoingCycle(start, 7, 4, day(29))).toMatchObject({ year: 2, phaseIndex: 0 })
    expect(ongoingCycle(start, MONTHLY_DRIP_DAYS, 12, day(-3))).toMatchObject({ year: 1, phaseIndex: 0 })
    expect(ongoingCycle(start, MONTHLY_DRIP_DAYS, 12, new Date('2026-12-31T00:00:00Z')).nextAt?.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
