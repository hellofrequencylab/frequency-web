import { describe, it, expect, beforeEach, vi } from 'vitest'

// RENAME AND DELETE A TO-DO (calendar suite pass 5, the Details panel). Both go through the
// service-role client, so both join `space_id` to the id predicate and must MATCH a row: an id from
// another Space changes nothing and reports false.

const h = vi.hoisted(() => {
  const state = {
    filters: [] as [string, string][],
    patch: null as unknown,
    deleted: false,
    matched: [{ id: 't1' }] as { id: string }[] | null,
    error: null as unknown,
  }
  const admin = {
    from(table: string) {
      const q: Record<string, unknown> = {
        update: (patch: Record<string, unknown>) => {
          state.patch = { table, ...patch }
          return q
        },
        delete: () => {
          state.deleted = true
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

import { deleteTaskInScope, retitleTaskInScope } from './tasks'

beforeEach(() => {
  h.state.filters = []
  h.state.patch = null
  h.state.deleted = false
  h.state.matched = [{ id: 't1' }]
  h.state.error = null
})

describe('retitleTaskInScope', () => {
  it('renames a to-do of this Space and bumps updated_at', async () => {
    expect(await retitleTaskInScope('t1', 'Order four mats', 's1')).toBe(true)
    expect(h.state.filters).toEqual([
      ['id', 't1'],
      ['space_id', 's1'],
    ])
    expect(h.state.patch).toMatchObject({ table: 'crm_tasks', title: 'Order four mats' })
    expect((h.state.patch as { updated_at: string }).updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('renames nothing for another Space, a blank title or a blank id', async () => {
    h.state.matched = []
    expect(await retitleTaskInScope('theirs', 'x', 's1')).toBe(false)
    expect(await retitleTaskInScope('t1', '', 's1')).toBe(false)
    expect(await retitleTaskInScope('', 'x', 's1')).toBe(false)
  })

  it('reports false when the write errors', async () => {
    h.state.error = new Error('boom')
    expect(await retitleTaskInScope('t1', 'x', 's1')).toBe(false)
  })
})

describe('deleteTaskInScope', () => {
  it('deletes a to-do of this Space and no other', async () => {
    expect(await deleteTaskInScope('t1', 's1')).toBe(true)
    expect(h.state.deleted).toBe(true)
    expect(h.state.filters).toEqual([
      ['id', 't1'],
      ['space_id', 's1'],
    ])
  })

  it('deletes nothing for an id that matches no row in this Space', async () => {
    h.state.matched = []
    expect(await deleteTaskInScope('theirs', 's1')).toBe(false)
    expect(await deleteTaskInScope('t1', '')).toBe(false)
  })
})
