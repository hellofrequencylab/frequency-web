import { describe, expect, it } from 'vitest'
import { isOverdueTodo, orderPlanTodos, todayDayKey } from './plan-todo-order'

const t = (id: string, status: string, dueAt: string | null) => ({ id, status, dueAt })

describe('orderPlanTodos', () => {
  it('puts open to-dos first by due day, undated last, and keeps the done ones apart', () => {
    const { open, done } = orderPlanTodos([
      t('undated', 'open', null),
      t('late', 'open', '2026-11-20T00:00:00Z'),
      t('finished', 'done', '2026-11-01T00:00:00Z'),
      t('soon', 'open', '2026-11-27'),
      t('first-of-day', 'open', '2026-11-27T09:00:00Z'),
    ])
    expect(open.map((x) => x.id)).toEqual(['late', 'soon', 'first-of-day', 'undated'])
    expect(done.map((x) => x.id)).toEqual(['finished'])
  })

  it('calls an open to-do overdue only when its day is before today', () => {
    expect(isOverdueTodo(t('a', 'open', '2026-11-24T23:00:00Z'), '2026-11-25')).toBe(true)
    expect(isOverdueTodo(t('b', 'open', '2026-11-25'), '2026-11-25')).toBe(false)
    expect(isOverdueTodo(t('c', 'done', '2026-11-01'), '2026-11-25')).toBe(false)
    expect(isOverdueTodo(t('d', 'open', null), '2026-11-25')).toBe(false)
  })

  it('formats today as a day key', () => {
    expect(todayDayKey(new Date(2026, 10, 25, 12))).toBe('2026-11-25')
  })
})
