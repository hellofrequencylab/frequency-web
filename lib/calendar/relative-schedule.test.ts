import { describe, it, expect } from 'vitest'
import {
  describeOffset,
  moveAnchoredDues,
  normalizeOffsetDays,
  offsetFromForm,
  planAnchorDayKey,
  resolveDueFromOffset,
} from './relative-schedule'

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

describe('normalizeOffsetDays', () => {
  it('keeps a whole signed number of days', () => {
    expect(normalizeOffsetDays(-14)).toBe(-14)
    expect(normalizeOffsetDays(2)).toBe(2)
    expect(normalizeOffsetDays('0')).toBe(0)
  })

  it('drops anything that is not a plan: fractions, words, and a cap-busting number', () => {
    expect(normalizeOffsetDays(1.5)).toBeNull()
    expect(normalizeOffsetDays('soon')).toBeNull()
    expect(normalizeOffsetDays(null)).toBeNull()
    expect(normalizeOffsetDays(401)).toBeNull()
    expect(normalizeOffsetDays(-401)).toBeNull()
  })
})

describe('offsetFromForm', () => {
  it('turns the way a person says it into the way the column stores it', () => {
    expect(offsetFromForm('14', 'before')).toBe(-14)
    expect(offsetFromForm('2', 'after')).toBe(2)
    expect(offsetFromForm('0', 'after')).toBe(0)
  })

  it('an empty field means the to-do is not anchored at all', () => {
    expect(offsetFromForm('', 'before')).toBeNull()
    expect(offsetFromForm('   ', 'before')).toBeNull()
  })

  it('a direction it does not know counts as before, never as after', () => {
    expect(offsetFromForm('3', 'whenever')).toBe(-3)
  })
})

describe('describeOffset', () => {
  it('says it the way the drawer shows it', () => {
    expect(describeOffset(-14)).toBe('14 days before')
    expect(describeOffset(-1)).toBe('1 day before')
    expect(describeOffset(2)).toBe('2 days after')
    expect(describeOffset(0)).toBe('on the day')
  })

  it('says nothing for a to-do with a fixed date', () => {
    expect(describeOffset(null)).toBeNull()
    expect(describeOffset(undefined)).toBeNull()
  })
})

describe('planAnchorDayKey', () => {
  it('reads the day out of the one date a Plan holds', () => {
    expect(planAnchorDayKey([{ starts_at: '2026-10-22T18:00:00.000Z' }])).toBe('2026-10-22')
  })

  // A Pencil may hold several candidate dates at once (ADR-1388). The prep list counts down to the
  // first time the thing could happen, so the EARLIEST wins: anchoring to a later candidate would
  // quietly hand the owner runway they do not have.
  it('takes the earliest of several candidate dates', () => {
    expect(
      planAnchorDayKey([
        { starts_at: '2026-11-05T18:00:00.000Z' },
        { starts_at: '2026-10-22T18:00:00.000Z' },
        { starts_at: '2026-12-01T18:00:00.000Z' },
      ]),
    ).toBe('2026-10-22')
  })

  it('never anchors to a cancelled date', () => {
    expect(
      planAnchorDayKey([
        { starts_at: '2026-10-22T18:00:00.000Z', status: 'cancelled' },
        { starts_at: '2026-11-05T18:00:00.000Z', status: 'confirmed' },
      ]),
    ).toBe('2026-11-05')
  })

  it('is null for a Plan with no live date, so an offset simply waits', () => {
    expect(planAnchorDayKey([])).toBeNull()
    expect(planAnchorDayKey([{ starts_at: 'not-a-date' }])).toBeNull()
    expect(planAnchorDayKey([{ starts_at: '2026-10-22T18:00:00.000Z', status: 'cancelled' }])).toBeNull()
  })
})

// THE WHOLE POINT, stated once as a scenario: the retreat slips a week and the prep list follows,
// except the one to-do that was pinned to a real date.
describe('moving the date moves the prep list', () => {
  const todos = [
    { id: 'engineer', dueOffsetDays: -14, dueAt: '2026-10-08T12:00:00.000Z' },
    { id: 'thank-you', dueOffsetDays: 2, dueAt: '2026-10-24T12:00:00.000Z' },
    { id: 'insurance-renewal', dueOffsetDays: null, dueAt: '2026-10-15T12:00:00.000Z' },
  ]

  it('re-resolves every anchored to-do against the new date and leaves the fixed one alone', () => {
    expect(moveAnchoredDues(todos, '2026-10-29')).toEqual([
      { id: 'engineer', dueAt: '2026-10-15T12:00:00.000Z' },
      { id: 'thank-you', dueAt: '2026-10-31T12:00:00.000Z' },
    ])
  })

  it('is idempotent: re-anchoring to the same date asks for the same days', () => {
    expect(moveAnchoredDues(todos, '2026-10-22')).toEqual([
      { id: 'engineer', dueAt: '2026-10-08T12:00:00.000Z' },
      { id: 'thank-you', dueAt: '2026-10-24T12:00:00.000Z' },
    ])
  })
})
