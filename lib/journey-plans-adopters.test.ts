import { describe, it, expect, vi, beforeEach } from 'vitest'

// countActiveAdopters — the "N members are on this Journey" count behind the unpublish warning.
// Locks the three things the warning depends on: it counts the ACTIVE adoptions of THAT plan, it
// can exclude one profile (the author's own adoption, so the number means OTHER people), and a
// null count (an empty table, or a failed read) reads as 0 rather than crashing the page.

type Call = { table: string; head: boolean; eq: Array<[string, unknown]>; neq: Array<[string, unknown]> }

const calls: Call[] = []
const result: { count: number | null } = { count: 0 }

function builder(table: string) {
  const call: Call = { table, head: false, eq: [], neq: [] }
  calls.push(call)
  const api = {
    select(_cols: string, opts?: { count?: string; head?: boolean }) {
      call.head = opts?.head === true
      return api
    },
    eq(col: string, val: unknown) {
      call.eq.push([col, val])
      return api
    },
    neq(col: string, val: unknown) {
      call.neq.push([col, val])
      return api
    },
    // The query is awaited directly (no .single()), so the builder is thenable.
    then(resolve: (r: { count: number | null }) => unknown) {
      return Promise.resolve(resolve({ count: result.count }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

import { countActiveAdopters } from './journey-plans'

beforeEach(() => {
  calls.length = 0
  result.count = 0
})

describe('countActiveAdopters', () => {
  it('counts only the ACTIVE adoptions of that plan, without fetching rows', async () => {
    result.count = 3
    expect(await countActiveAdopters('plan-1')).toBe(3)

    const call = calls[0]
    expect(call?.table).toBe('journey_plan_adoptions')
    expect(call?.head).toBe(true) // head:true — a count, never a row read
    expect(call?.eq).toContainEqual(['plan_id', 'plan-1'])
    expect(call?.eq).toContainEqual(['active', true])
    expect(call?.neq).toEqual([])
  })

  it('excludes one profile when asked, so the count means OTHER members', async () => {
    result.count = 2
    expect(await countActiveAdopters('plan-1', 'author-1')).toBe(2)
    expect(calls[0]?.neq).toContainEqual(['profile_id', 'author-1'])
  })

  it('reads a null count as 0', async () => {
    result.count = null
    expect(await countActiveAdopters('plan-1')).toBe(0)
  })
})
