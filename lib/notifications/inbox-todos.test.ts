import { describe, expect, it } from 'vitest'
import { inboxTodos, inboxView, parseInboxView, type InboxTodoRow } from './inbox'

const NOW = new Date('2026-11-25T18:00:00Z')
const SPACE = { id: 's1', slug: 'river', name: 'River Room' }
const spaces = new Map([[SPACE.id, SPACE]])
const plans = new Map([['p1', 'Winter market']])

function row(id: string, extra: Partial<InboxTodoRow> = {}): InboxTodoRow {
  return { id, title: id, due_at: null, space_id: 's1', plan_id: 'p1', ...extra }
}

describe('Inbox To-dos view (SCAN-1347)', () => {
  it('is its own view, and holds no notices', () => {
    expect(parseInboxView('todos')).toBe('todos')
    expect(inboxView([], 'todos', NOW)).toEqual([])
  })

  it('puts overdue first, then by due date, undated last, and links each to its Plan', () => {
    const out = inboxTodos(
      [row('later', { due_at: '2026-12-02T00:00:00Z' }), row('undated'), row('late', { due_at: '2026-11-20T00:00:00Z' }), row('soon', { due_at: '2026-11-27T00:00:00Z' })],
      spaces,
      plans,
      NOW,
    )
    expect(out.map((t) => t.id)).toEqual(['late', 'soon', 'later', 'undated'])
    expect(out[0]).toMatchObject({ overdue: true, planTitle: 'Winter market', href: '/spaces/river/settings/calendar?plan=p1' })
  })

  it('lists a to-do once, and leaves out one on an archived Plan or an unread Space', () => {
    const out = inboxTodos([row('a'), row('a'), row('gone', { plan_id: 'p9' }), row('elsewhere', { space_id: 's9' }), row('loose', { plan_id: null })], spaces, plans, NOW)
    expect(out.map((t) => t.id)).toEqual(['a', 'loose'])
    expect(out[1].href).toBe('/spaces/river/settings/calendar')
  })
})
