import { describe, it, expect } from 'vitest'
import { weeklyTargetFromCadence } from './journey-plans'

describe('weeklyTargetFromCadence', () => {
  it('reads daily as every day (7)', () => {
    expect(weeklyTargetFromCadence('Daily')).toBe(7)
    expect(weeklyTargetFromCadence('every day')).toBe(7)
    expect(weeklyTargetFromCadence('each day, ideally morning')).toBe(7)
  })

  it('reads explicit counts (Nx / N times / N days / N per / N/week)', () => {
    expect(weeklyTargetFromCadence('3x a week')).toBe(3)
    expect(weeklyTargetFromCadence('5 times a week')).toBe(5)
    expect(weeklyTargetFromCadence('4 days a week')).toBe(4)
    expect(weeklyTargetFromCadence('2/week')).toBe(2)
    expect(weeklyTargetFromCadence('6 per week')).toBe(6)
  })

  it('reads worded twice / thrice', () => {
    expect(weeklyTargetFromCadence('Twice a week')).toBe(2)
    expect(weeklyTargetFromCadence('Three times a week')).toBe(3)
  })

  it('falls back to 1 for weekly / monthly / unknown / null', () => {
    expect(weeklyTargetFromCadence('Weekly')).toBe(1)
    expect(weeklyTargetFromCadence('Monthly')).toBe(1)
    expect(weeklyTargetFromCadence('whenever you can')).toBe(1)
    expect(weeklyTargetFromCadence(null)).toBe(1)
    expect(weeklyTargetFromCadence('')).toBe(1)
  })

  it('clamps to the 1–7 window', () => {
    expect(weeklyTargetFromCadence('10x a week')).toBe(7)
    expect(weeklyTargetFromCadence('0x a week')).toBe(1)
  })
})
