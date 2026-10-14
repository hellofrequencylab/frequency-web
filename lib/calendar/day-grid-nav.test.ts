import { describe, expect, it } from 'vitest'
import { dayForKey, dayKeyIn, isWeekendDay, stepDay, weekEdge } from './day-grid-nav'

describe('the day grid keyboard', () => {
  it('steps days across month and year edges', () => {
    expect(stepDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(stepDay('2026-01-01', -1)).toBe('2025-12-31')
    expect(stepDay('not-a-day', 1)).toBe('not-a-day')
  })

  it('moves a week on Up and Down, a day on Left and Right', () => {
    expect(dayForKey('2026-10-14', 'ArrowDown')).toBe('2026-10-21')
    expect(dayForKey('2026-10-14', 'ArrowUp')).toBe('2026-10-07')
    expect(dayForKey('2026-10-14', 'ArrowLeft')).toBe('2026-10-13')
    expect(dayForKey('2026-10-14', 'ArrowRight')).toBe('2026-10-15')
    expect(dayForKey('2026-10-14', 'Enter')).toBeNull()
  })

  it('Home and End land on the Sunday and Saturday of the same week', () => {
    // 2026-10-14 is a Wednesday.
    expect(weekEdge('2026-10-14', 'start')).toBe('2026-10-11')
    expect(weekEdge('2026-10-14', 'end')).toBe('2026-10-17')
  })

  it('knows a weekend', () => {
    expect(isWeekendDay('2026-10-17')).toBe(true)
    expect(isWeekendDay('2026-10-18')).toBe(true)
    expect(isWeekendDay('2026-10-19')).toBe(false)
  })

  it('reads today in a named zone, not the runtime one', () => {
    const late = new Date('2026-10-14T05:00:00Z') // 22:00 on the 13th in Los Angeles
    expect(dayKeyIn('America/Los_Angeles', late)).toBe('2026-10-13')
    expect(dayKeyIn(null, late)).toBe('2026-10-13')
    expect(dayKeyIn('Europe/London', late)).toBe('2026-10-14')
  })
})
