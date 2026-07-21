import { describe, it, expect } from 'vitest'
import { attributedLogDay } from './log-day'

describe('attributedLogDay (overnight session attribution · ADR-801)', () => {
  it('attributes a session STARTED yesterday but finalized today to yesterday (the overnight fix)', () => {
    // The exact Aiden case: started 2026-07-20, finalized 2026-07-21 -> belongs to 07-20.
    expect(attributedLogDay('2026-07-21', '2026-07-20')).toBe('2026-07-20')
  })

  it('keeps a same-day session on the finalize day', () => {
    expect(attributedLogDay('2026-07-21', '2026-07-21')).toBe('2026-07-21')
  })

  it('handles the midnight-crossing sit (started 11:50pm day N, finalized 12:10am day N+1)', () => {
    // startedDay is day N, finalizeDay day N+1 -> attributed to N (where the member began).
    expect(attributedLogDay('2026-07-01', '2026-06-30')).toBe('2026-06-30')
  })

  it('crosses a month boundary correctly', () => {
    expect(attributedLogDay('2026-08-01', '2026-07-31')).toBe('2026-07-31')
  })

  it('CLAMPS a start more than one day back to the finalize day (no deep backdating)', () => {
    // A stale/forged 3-day-old start cannot backdate the log; it stays on the finalize day.
    expect(attributedLogDay('2026-07-21', '2026-07-18')).toBe('2026-07-21')
    expect(attributedLogDay('2026-07-21', '2026-07-19')).toBe('2026-07-21') // exactly 2 back -> clamped
  })

  it('ignores a FUTURE start day (never attribute forward)', () => {
    expect(attributedLogDay('2026-07-21', '2026-07-22')).toBe('2026-07-21')
  })

  it('falls back to the finalize day for a missing or malformed start day', () => {
    expect(attributedLogDay('2026-07-21', null)).toBe('2026-07-21')
    expect(attributedLogDay('2026-07-21', undefined)).toBe('2026-07-21')
    expect(attributedLogDay('2026-07-21', 'not-a-date')).toBe('2026-07-21')
    expect(attributedLogDay('2026-07-21', '')).toBe('2026-07-21')
  })
})
