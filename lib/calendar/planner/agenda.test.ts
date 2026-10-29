import { describe, expect, it } from 'vitest'
import { buildAgenda } from './agenda'
import type { PlannerData, PlannerItem, PlannerTask } from './types'

const today = '2026-10-21'
const item = (o: Partial<PlannerItem> & { id: string }): PlannerItem => ({
  title: o.id, kind: 'event', date: today, startMin: 18 * 60, durMin: 60, ...o,
})
const task = (o: Partial<PlannerTask> & { id: string }): PlannerTask => ({ title: o.id, due: today, done: false, ...o })
const data = (o: Partial<PlannerData>): PlannerData => ({ items: [], tasks: [], plans: [], ...o })

describe('buildAgenda', () => {
  const d = data({
    plans: [{ id: 'p', title: 'Sound bath', stage: 'planning', target: 'Event', team: [], spaces: [] }],
    items: [
      item({ id: 'huddle', kind: 'private', startMin: 8 * 60 + 30, durMin: 30 }),
      item({ id: 'cowork', startMin: 9 * 60 + 30, durMin: 450, going: 24 }),
      item({ id: 'tea', plan: 'p' }),
      item({ id: 'retreat', kind: 'unavailable', date: '2026-10-23', end: '2026-10-25', startMin: null }),
      item({ id: 'gone', kind: 'cancelled', date: '2026-10-24', startMin: null }),
      item({ id: 'far', date: '2026-12-30' }),
    ],
    tasks: [task({ id: 'done-today', done: true }), task({ id: 'tomorrow', due: '2026-10-22' }), task({ id: 'late', due: '2026-10-20' })],
  })
  const days = buildAgenda(d, today, today, 'meld')
  it('starts today and skips days with nothing on them', () => {
    expect(days[0].key).toBe(today)
    expect(days[0].rel).toBe('Today')
    expect(days[1].key).toBe('2026-10-22')
    expect(days[1].rel).toBe('Tomorrow')
    expect(days.map((x) => x.key)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    expect(days[2].rel).toBe('')
  })
  it('stops at 45 days', () => {
    expect(days.some((x) => x.key === '2026-12-30')).toBe(false)
    expect(buildAgenda(d, today, today, 'meld', 80).some((x) => x.key === '2026-12-30')).toBe(true)
  })
  it('words the time range', () => {
    const rows = days[0].rows
    expect(rows.find((r) => r.id === 'cowork')?.range).toBe('9:30 AM to 5 PM')
    expect(rows.find((r) => r.id === 'cowork')?.going).toBe('24 going')
    expect(rows.find((r) => r.id === 'tea')?.planTitle).toBe('Sound bath')
    expect(days[2].rows[0].range).toBe('Through Sun, Oct 25')
    expect(days[3].rows.find((r) => r.id === 'gone')).toMatchObject({ range: 'All day', cancelled: true })
  })
  it('reads each to-do against its own day, not always "Due today"', () => {
    expect(days[0].rows.find((r) => r.id === 'done-today')?.range).toBe('Done')
    expect(days[1].rows.find((r) => r.id === 'tomorrow')?.range).toBe('Due')
    const later = buildAgenda(d, '2026-10-01', today, 'meld') // cursor in the same month: starts today
    expect(later[0].key).toBe(today)
    const earlier = buildAgenda(data({ tasks: [task({ id: 'o', due: '2026-10-05' })] }), '2026-10-10', '2026-11-15', 'meld')
    expect(earlier[0].rows[0].range).toBe('Overdue')
  })
  it('lists items before to-dos, bands first', () => {
    expect(days[0].rows.map((r) => r.src)).toEqual(['item', 'item', 'item', 'todo'])
  })
  it('starts at the first of the month when the cursor is in another month', () => {
    const nov = buildAgenda(data({ items: [item({ id: 'a', date: '2026-11-01' })] }), '2026-11-18', today, 'meld')
    expect(nov[0].key).toBe('2026-11-01')
  })
  it('honours hidden tiles', () => {
    const hidden = buildAgenda({ ...d, hidden: { todos: true, unavailable: true } }, today, today, 'meld')
    expect(hidden.flatMap((x) => x.rows).some((r) => r.src === 'todo' || r.kind === 'unavailable')).toBe(false)
  })
})
