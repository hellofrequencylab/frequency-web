import { describe, it, expect } from 'vitest'
import {
  TERM_PRESETS,
  DEFAULT_TERM_WEEKS,
  ACTIVE_PRACTICE_CAP,
  coerceTermWeeks,
  cleanCue,
  termWindow,
  termProgress,
  withinActiveCap,
} from './adoption'

describe('TERM_PRESETS (owner decisions 2026-08-03)', () => {
  it('is exactly four chips: 2 / 4 (default) / 8 (recommended) / ongoing', () => {
    expect(TERM_PRESETS.map((p) => p.weeks)).toEqual([2, 4, 8, null])
    expect(TERM_PRESETS.find((p) => p.default)?.weeks).toBe(4)
    expect(TERM_PRESETS.find((p) => p.recommended)?.weeks).toBe(8)
  })

  it('the default constant agrees with the default chip', () => {
    expect(DEFAULT_TERM_WEEKS).toBe(4)
  })

  it('no chip copy carries an em dash (CONTENT-VOICE)', () => {
    for (const p of TERM_PRESETS) {
      expect(p.label).not.toMatch(/[—–]/)
      expect(p.hint).not.toMatch(/[—–]/)
    }
  })
})

describe('coerceTermWeeks (default-safe narrowing)', () => {
  it('accepts every preset value', () => {
    expect(coerceTermWeeks(2)).toBe(2)
    expect(coerceTermWeeks(4)).toBe(4)
    expect(coerceTermWeeks(8)).toBe(8)
    expect(coerceTermWeeks(null)).toBeNull()
    expect(coerceTermWeeks('ongoing')).toBeNull()
    expect(coerceTermWeeks('8')).toBe(8)
  })

  it('falls to the DEFAULT on anything off the preset list (never accidentally ongoing)', () => {
    expect(coerceTermWeeks(3)).toBe(DEFAULT_TERM_WEEKS)
    expect(coerceTermWeeks(52)).toBe(DEFAULT_TERM_WEEKS)
    expect(coerceTermWeeks('forever')).toBe(DEFAULT_TERM_WEEKS)
    expect(coerceTermWeeks(undefined)).toBe(DEFAULT_TERM_WEEKS)
    expect(coerceTermWeeks(NaN)).toBe(DEFAULT_TERM_WEEKS)
    expect(coerceTermWeeks(-4)).toBe(DEFAULT_TERM_WEEKS)
  })
})

describe('cleanCue', () => {
  it('trims, caps at 140, and returns null for empty/non-string', () => {
    expect(cleanCue('  After my morning coffee  ')).toBe('After my morning coffee')
    expect(cleanCue('')).toBeNull()
    expect(cleanCue('   ')).toBeNull()
    expect(cleanCue(42)).toBeNull()
    expect(cleanCue(null)).toBeNull()
    expect(cleanCue('x'.repeat(200))!.length).toBe(140)
  })
})

describe('termWindow (inclusive end)', () => {
  it('a 2-week term starting Aug 3 ends Aug 16 (14 days inclusive)', () => {
    expect(termWindow('2026-08-03', 2)).toEqual({ startsOn: '2026-08-03', endsOn: '2026-08-16' })
  })

  it('a 4-week term spans exactly 28 days', () => {
    const w = termWindow('2026-08-03', 4)
    expect(w.endsOn).toBe('2026-08-30')
  })

  it('crosses month + year boundaries correctly', () => {
    expect(termWindow('2026-12-25', 2).endsOn).toBe('2027-01-07')
  })

  it('ongoing has no end', () => {
    expect(termWindow('2026-08-03', null)).toEqual({ startsOn: '2026-08-03', endsOn: null })
  })
})

describe('termProgress (endowed, clamped, 1-based)', () => {
  const W = { startsOn: '2026-08-03', endsOn: '2026-08-30' } // 4 weeks

  it('the adoption day is Day 1 of 28, Week 1 of 4 (never an empty bar)', () => {
    expect(termProgress({ ...W, today: '2026-08-03' })).toEqual({
      day: 1, totalDays: 28, week: 1, totalWeeks: 4, finished: false,
    })
  })

  it('day 8 is Week 2', () => {
    const p = termProgress({ ...W, today: '2026-08-10' })
    expect(p.day).toBe(8)
    expect(p.week).toBe(2)
  })

  it('the last day is Day 28 and NOT finished (the member still has today)', () => {
    const p = termProgress({ ...W, today: '2026-08-30' })
    expect(p.day).toBe(28)
    expect(p.finished).toBe(false)
  })

  it('the morning after the last day is finished, clamped to Day 28', () => {
    const p = termProgress({ ...W, today: '2026-08-31' })
    expect(p.day).toBe(28)
    expect(p.finished).toBe(true)
  })

  it('a read BEFORE the start clamps to Day 1 (never Day 0 or negative)', () => {
    expect(termProgress({ ...W, today: '2026-08-01' }).day).toBe(1)
  })

  it('ongoing counts up forever and never finishes', () => {
    const p = termProgress({ startsOn: '2026-08-03', endsOn: null, today: '2026-11-03' })
    expect(p.day).toBe(93)
    expect(p.totalDays).toBeNull()
    expect(p.finished).toBe(false)
  })
})

describe('withinActiveCap (cap 5, self rows only)', () => {
  it('caps at exactly ACTIVE_PRACTICE_CAP', () => {
    expect(ACTIVE_PRACTICE_CAP).toBe(5)
    expect(withinActiveCap(0)).toBe(true)
    expect(withinActiveCap(4)).toBe(true)
    expect(withinActiveCap(5)).toBe(false)
    expect(withinActiveCap(50)).toBe(false)
  })

  it('fail-safe on a negative count', () => {
    expect(withinActiveCap(-3)).toBe(true)
  })
})
