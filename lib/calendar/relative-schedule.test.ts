import { describe, it, expect } from 'vitest'
import { moveAnchoredDues, resolveDueFromOffset } from './relative-schedule'

describe('resolveDueFromOffset', () => {
  it('puts 21 days before on the calendar', () => {
    expect(resolveDueFromOffset('2026-10-22', -21)).toBe('2026-10-01')
  })

  it('puts 2 days after on the calendar', () => {
    expect(resolveDueFromOffset('2026-10-22', 2)).toBe('2026-10-24')
  })

  it('leaves a fixed due alone', () => {
    expect(resolveDueFromOffset('2026-10-22', null)).toBeNull()
  })
})

describe('moveAnchoredDues', () => {
  it('moves only anchored to-dos', () => {
    const moved = moveAnchoredDues(
      [
        { id: 'a', dueOffsetDays: -7, dueAt: '2026-01-01T12:00:00.000Z' },
        { id: 'b', dueOffsetDays: null, dueAt: '2026-06-01T12:00:00.000Z' },
      ],
      '2026-10-22',
    )
    expect(moved).toEqual([{ id: 'a', dueAt: '2026-10-15T12:00:00.000Z' }])
  })
})
