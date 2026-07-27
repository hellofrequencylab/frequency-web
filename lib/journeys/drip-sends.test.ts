import { describe, it, expect } from 'vitest'
import { selectDueDripPhases } from './drip-sends'

const start = '2026-08-01T00:00:00Z'
const day = (n: number) => new Date(Date.parse(start) + n * 86_400_000)

describe('selectDueDripPhases (ADR-840)', () => {
  it('never includes phase 0 (open at enrollment) and unlocks one phase per interval', () => {
    expect(
      selectDueDripPhases({ startedAt: start, dripIntervalDays: 7, totalPhases: 4, deliveredPhases: [], now: day(0) }),
    ).toEqual([])
    expect(
      selectDueDripPhases({ startedAt: start, dripIntervalDays: 7, totalPhases: 4, deliveredPhases: [], now: day(7) }),
    ).toEqual([1])
    expect(
      selectDueDripPhases({ startedAt: start, dripIntervalDays: 7, totalPhases: 4, deliveredPhases: [], now: day(21) }),
    ).toEqual([1, 2, 3])
  })

  it('excludes phases already in the ledger, whatever their status', () => {
    expect(
      selectDueDripPhases({
        startedAt: start,
        dripIntervalDays: 7,
        totalPhases: 4,
        deliveredPhases: [1, 2],
        now: day(21),
      }),
    ).toEqual([3])
  })

  it('caps at the plan total (no phantom phases long after the end)', () => {
    expect(
      selectDueDripPhases({ startedAt: start, dripIntervalDays: 7, totalPhases: 3, deliveredPhases: [], now: day(365) }),
    ).toEqual([1, 2])
  })

  it('interval <= 0 means no drip: nothing to announce', () => {
    expect(
      selectDueDripPhases({ startedAt: start, dripIntervalDays: 0, totalPhases: 4, deliveredPhases: [], now: day(30) }),
    ).toEqual([])
  })

  it('a single-phase (flat) Journey has nothing to drip', () => {
    expect(
      selectDueDripPhases({ startedAt: start, dripIntervalDays: 7, totalPhases: 1, deliveredPhases: [], now: day(30) }),
    ).toEqual([])
  })

  it('fails safe on an unparseable anchor', () => {
    expect(
      selectDueDripPhases({ startedAt: 'garbage', dripIntervalDays: 7, totalPhases: 4, deliveredPhases: [], now: day(30) }),
    ).toEqual([])
  })
})
