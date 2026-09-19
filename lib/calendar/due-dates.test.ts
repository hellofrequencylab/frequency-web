import { describe, it, expect } from 'vitest'
import { dueTaskToCalendarItem } from './due-dates'

describe('dueTaskToCalendarItem', () => {
  it('maps a to-do onto the team calendar', () => {
    const item = dueTaskToCalendarItem({
      id: 't1',
      title: 'Confirm room',
      dueAt: '2026-10-01T12:00:00.000Z',
      planId: 'p1',
    })
    expect(item?.dayKey).toBe('2026-10-01')
    expect(item?.layer).toBe('todos')
    expect(item?.slug).toBe('todo-t1')
  })
})
