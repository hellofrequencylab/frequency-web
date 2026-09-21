import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE SCOPED RE-ANCHOR WRITE (PROG-CAL5). The write half of "move the date, move the prep list".
//
// Scoped for the same reason `updateTaskStatusInScope` is: crm_tasks is reached through the
// service-role client, so an id that arrived from an owner's browser is not evidence of anything.
// Every statement carries `space_id` AND `plan_id` beside the row id, and the count that comes back
// is the number of rows that ACTUALLY moved — a partial failure is reported as a shortfall, never as
// a clean success, because a checklist half-moved is worse than one that did not move.

const h = vi.hoisted(() => {
  const state = {
    calls: [] as { filters: [string, string][]; patch: Record<string, unknown> }[],
    matched: null as ((id: string) => { id: string }[]) | null,
    error: null as unknown,
  }
  const admin = {
    from(table: string) {
      const call = { filters: [] as [string, string][], patch: {} as Record<string, unknown> }
      const q: Record<string, unknown> = {
        update: (patch: Record<string, unknown>) => {
          call.patch = { table, ...patch }
          return q
        },
        eq: (col: string, val: string) => {
          call.filters.push([col, val])
          return q
        },
        select: async () => {
          state.calls.push(call)
          const id = call.filters.find(([c]) => c === 'id')?.[1] ?? ''
          return { data: state.matched ? state.matched(id) : [{ id }], error: state.error }
        },
      }
      return q
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

import { reanchorTaskDuesInScope, taskDuePatch } from './tasks'

beforeEach(() => {
  h.state.calls = []
  h.state.matched = null
  h.state.error = null
})

describe('reanchorTaskDuesInScope', () => {
  it('moves every to-do it is given, each one scoped to this Space and this Plan', async () => {
    const moved = await reanchorTaskDuesInScope(
      [
        { id: 'engineer', dueAt: '2026-10-15T12:00:00.000Z' },
        { id: 'thank-you', dueAt: '2026-10-31T12:00:00.000Z' },
      ],
      { spaceId: 's1', planId: 'p1' },
    )
    expect(moved).toBe(2)
    expect(h.state.calls.map((c) => c.filters)).toEqual([
      [
        ['id', 'engineer'],
        ['space_id', 's1'],
        ['plan_id', 'p1'],
      ],
      [
        ['id', 'thank-you'],
        ['space_id', 's1'],
        ['plan_id', 'p1'],
      ],
    ])
    expect(h.state.calls[0].patch).toMatchObject({
      table: 'crm_tasks',
      due_at: '2026-10-15T12:00:00.000Z',
    })
  })

  it('counts a to-do of another Space as a miss rather than moving it', async () => {
    h.state.matched = (id) => (id === 'mine' ? [{ id }] : [])
    const moved = await reanchorTaskDuesInScope(
      [
        { id: 'mine', dueAt: '2026-10-15T12:00:00.000Z' },
        { id: 'someone-elses', dueAt: '2026-10-15T12:00:00.000Z' },
      ],
      { spaceId: 's1', planId: 'p1' },
    )
    expect(moved).toBe(1)
  })

  it('refuses to write without both halves of the scope', async () => {
    expect(await reanchorTaskDuesInScope([{ id: 't', dueAt: '2026-10-15' }], { spaceId: '  ', planId: 'p1' })).toBe(0)
    expect(await reanchorTaskDuesInScope([{ id: 't', dueAt: '2026-10-15' }], { spaceId: 's1', planId: '' })).toBe(0)
    expect(h.state.calls).toHaveLength(0)
  })

  it('skips an unparseable instant instead of writing a broken due date', async () => {
    const moved = await reanchorTaskDuesInScope(
      [
        { id: 'good', dueAt: '2026-10-15T12:00:00.000Z' },
        { id: 'bad', dueAt: 'whenever' },
      ],
      { spaceId: 's1', planId: 'p1' },
    )
    expect(moved).toBe(1)
    expect(h.state.calls).toHaveLength(1)
  })

  it('reports a write error as a shortfall, not a success', async () => {
    h.state.error = { message: 'nope' }
    expect(
      await reanchorTaskDuesInScope([{ id: 't', dueAt: '2026-10-15T12:00:00.000Z' }], {
        spaceId: 's1',
        planId: 'p1',
      }),
    ).toBe(0)
  })

  it('writes nothing when there is nothing to move', async () => {
    expect(await reanchorTaskDuesInScope([], { spaceId: 's1', planId: 'p1' })).toBe(0)
    expect(h.state.calls).toHaveLength(0)
  })
})

describe('taskDuePatch', () => {
  it('sets the due date and bumps updated_at so the board reorders', () => {
    expect(taskDuePatch('2026-10-15T12:00:00.000Z', Date.parse('2026-09-21T00:00:00.000Z'))).toEqual({
      due_at: '2026-10-15T12:00:00.000Z',
      updated_at: '2026-09-21T00:00:00.000Z',
    })
  })

  it('is null for an instant it cannot read', () => {
    expect(taskDuePatch('whenever')).toBeNull()
    expect(taskDuePatch(null as never)).toBeNull()
  })
})
