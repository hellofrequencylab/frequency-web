import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE SCOPED STATUS WRITE (PROG-CAL4). `updateTaskStatus` takes a bare id, which is safe on the
// platform-staff Tasks board and NOT safe on a Space surface: the id comes from an owner's browser
// and crm_tasks is written with the service-role client. `updateTaskStatusInScope` therefore joins
// `space_id` (and `plan_id`) to the id predicate and requires a row to MATCH. These tests record the
// filters the builder receives and pin both arms: a task of this Space moves, a task of another
// Space matches nothing and reports false.

const h = vi.hoisted(() => {
  const state = { filters: [] as [string, string][], patch: null as unknown, matched: [{ id: 't1' }] as { id: string }[] | null, error: null as unknown }
  const admin = {
    from(table: string) {
      const q: Record<string, unknown> = {
        update: (patch: Record<string, unknown>) => {
          state.patch = { table, ...patch }
          return q
        },
        eq: (col: string, val: string) => {
          state.filters.push([col, val])
          return q
        },
        select: async () => ({ data: state.matched, error: state.error }),
      }
      return q
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

import { updateTaskStatusInScope, taskStatusPatch } from './tasks'

beforeEach(() => {
  h.state.filters = []
  h.state.patch = null
  h.state.matched = [{ id: 't1' }]
  h.state.error = null
})

describe('updateTaskStatusInScope', () => {
  it('completes a to-do of this Space and this Plan, and says so', async () => {
    const ok = await updateTaskStatusInScope('t1', 'done', { spaceId: 's1', planId: 'p1' })
    expect(ok).toBe(true)
    expect(h.state.filters).toEqual([
      ['id', 't1'],
      ['space_id', 's1'],
      ['plan_id', 'p1'],
    ])
    expect(h.state.patch).toMatchObject({ table: 'crm_tasks', status: 'done' })
  })

  it('re-opens a completed to-do (the checkbox works both ways)', async () => {
    await updateTaskStatusInScope('t1', 'open', { spaceId: 's1', planId: 'p1' })
    expect(h.state.patch).toMatchObject({ status: 'open' })
  })

  it('moves nothing when the id belongs to another Space', async () => {
    h.state.matched = []
    const ok = await updateTaskStatusInScope('someone-elses-task', 'done', { spaceId: 's1', planId: 'p1' })
    expect(ok).toBe(false)
  })

  it('scopes by Space alone when no Plan is named', async () => {
    await updateTaskStatusInScope('t1', 'done', { spaceId: 's1' })
    expect(h.state.filters).toEqual([
      ['id', 't1'],
      ['space_id', 's1'],
    ])
  })

  it('refuses an unknown status or a missing scope without touching the table', async () => {
    expect(await updateTaskStatusInScope('t1', 'archived' as never, { spaceId: 's1' })).toBe(false)
    expect(await updateTaskStatusInScope('t1', 'done', { spaceId: '  ' })).toBe(false)
    expect(await updateTaskStatusInScope('  ', 'done', { spaceId: 's1' })).toBe(false)
    expect(h.state.patch).toBeNull()
  })

  it('reports a write error as a miss', async () => {
    h.state.error = { message: 'nope' }
    expect(await updateTaskStatusInScope('t1', 'done', { spaceId: 's1' })).toBe(false)
  })
})

describe('taskStatusPatch', () => {
  it('bumps updated_at and leaves the due date alone by default', () => {
    const patch = taskStatusPatch('done', { now: Date.parse('2026-09-21T00:00:00.000Z') })
    expect(patch).toEqual({ status: 'done', updated_at: '2026-09-21T00:00:00.000Z' })
  })

  it('carries a parseable due date and drops an unparseable one', () => {
    expect(taskStatusPatch('snoozed', { dueAt: '2026-10-01' })!.due_at).toBe(new Date('2026-10-01').toISOString())
    expect(taskStatusPatch('snoozed', { dueAt: 'soon' })!.due_at).toBeUndefined()
  })

  it('returns null for a status the table does not have', () => {
    expect(taskStatusPatch('archived' as never)).toBeNull()
  })
})
