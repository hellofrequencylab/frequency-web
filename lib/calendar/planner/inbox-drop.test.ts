import { describe, expect, it } from 'vitest'
import { DEFAULT_BLOCK_MINUTES, applyTodoUpdate, dropTodoOnDay, dropTodoOnTime } from './inbox-drop'
import type { PlannerTask } from './types'

const todo: PlannerTask = { id: 'order-mats', title: 'Order mats', due: null, done: false, plan: 'p1', owner: 'dt', estHours: 1.5 }

describe('dropping an inbox to-do', () => {
  it('on a time updates the same to-do with a due day and a start', () => {
    const u = dropTodoOnTime(todo, '2026-10-23', 14 * 60)
    expect(u.type).toBe('update-todo')
    expect(u.id).toBe('order-mats')
    expect(u.patch).toEqual({ id: 'order-mats', due: '2026-10-23', startMin: 14 * 60, blockMin: 90 })
  })
  it('never carries a second id or a create arm', () => {
    const u = dropTodoOnTime(todo, '2026-10-23', 14 * 60)
    expect(Object.keys(u).sort()).toEqual(['id', 'patch', 'type'])
    expect(u.patch.id).toBe(todo.id)
    expect(JSON.stringify(u)).not.toMatch(/create|kind|"todo"/)
  })
  it('leaves exactly one record after applying the drop', () => {
    const list = [todo, { ...todo, id: 'other', title: 'Other' }]
    const u = dropTodoOnTime(todo, '2026-10-23', 600)
    const after = list.map((t) => applyTodoUpdate(t, u))
    expect(after).toHaveLength(2)
    expect(after.filter((t) => t.title === 'Order mats')).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: 'order-mats', due: '2026-10-23', startMin: 600, plan: 'p1', owner: 'dt' })
    expect(after[1]).toEqual(list[1])
  })
  it('snaps to 15 minutes and holds the block inside the day', () => {
    expect(dropTodoOnTime(todo, '2026-10-23', 14 * 60 + 8).patch.startMin).toBe(14 * 60 + 15)
    expect(dropTodoOnTime(todo, '2026-10-23', 14 * 60 + 7).patch.startMin).toBe(14 * 60)
    expect(dropTodoOnTime(todo, '2026-10-23', 23 * 60 + 45).patch.startMin).toBe(1440 - 90)
    expect(dropTodoOnTime(todo, '2026-10-23', -30).patch.startMin).toBe(0)
  })
  it('gives a to-do without an estimate half an hour', () => {
    const bare = { id: 'x' }
    expect(dropTodoOnTime(bare, '2026-10-23', 600).patch.blockMin).toBe(DEFAULT_BLOCK_MINUTES)
    expect(dropTodoOnTime({ id: 'x', estHours: 0 }, '2026-10-23', 600).patch.blockMin).toBe(30)
  })
  it('on a day only sets the due day', () => {
    const u = dropTodoOnDay(todo, '2026-10-25')
    expect(u.patch).toEqual({ id: 'order-mats', due: '2026-10-25' })
    expect(applyTodoUpdate({ ...todo, startMin: 540 }, u)).toMatchObject({ due: '2026-10-25', startMin: 540 })
  })
  it('ignores an update meant for a different to-do', () => {
    const u = dropTodoOnDay({ id: 'someone-else' }, '2026-10-25')
    expect(applyTodoUpdate(todo, u)).toBe(todo)
  })
})
