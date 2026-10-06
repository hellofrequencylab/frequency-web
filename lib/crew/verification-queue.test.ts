import { describe, it, expect, vi } from 'vitest'

// SCAN-752 (2026-10-05). The verification queue read crew_completions by verified_by null, limited
// to 50, and only then dropped rows whose task does not require verification. Ordinary completions
// never carry verified_by, so fifty of them hid every held completion for good and the held Zaps
// never released. Locked here: the held marker is verified_at, the requires_verification filter
// runs in SQL through an inner join on the task, and both come before the limit.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('not used') } }))

import { listHeldCompletions, VERIFICATION_QUEUE_LIMIT } from './verification-queue'

type Call = [string, ...unknown[]]

function fakeAdmin(rows: unknown[], calls: Call[]) {
  const chain: Record<string, unknown> = {}
  const record = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return chain }
  for (const m of ['select', 'is', 'eq', 'order']) chain[m] = record(m)
  chain.limit = async (n: number) => { calls.push(['limit', n]); return { data: rows, error: null } }
  return { from: (table: string) => { calls.push(['from', table]); return chain } }
}

describe('listHeldCompletions', () => {
  it('keys on verified_at null and filters requires_verification in SQL, before the limit', async () => {
    const calls: Call[] = []
    const rows = [{ id: 'c1', completed_at: '2026-10-01T00:00:00Z', zaps_earned: null, task: { id: 't1', name: 'Greet', zaps_value: 5, circle_id: null }, member: null }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await listHeldCompletions(fakeAdmin(rows, calls) as any)

    expect(calls[0]).toEqual(['from', 'crew_completions'])
    const select = String(calls[1][1])
    expect(select).toMatch(/task:crew_tasks!task_id!inner/)
    expect(select).toMatch(/circle_id/)
    expect(calls).toContainEqual(['is', 'verified_at', null])
    expect(calls).toContainEqual(['eq', 'task.requires_verification', true])
    expect(calls.some((c) => c[0] === 'is' && c[1] === 'verified_by')).toBe(false)

    const limitAt = calls.findIndex((c) => c[0] === 'limit')
    expect(calls[limitAt][1]).toBe(VERIFICATION_QUEUE_LIMIT)
    expect(calls.findIndex((c) => c[0] === 'is')).toBeLessThan(limitAt)
    expect(calls.findIndex((c) => c[0] === 'eq')).toBeLessThan(limitAt)

    expect(out).toHaveLength(1)
    expect(out[0].zaps_earned).toBe(0)
  })

  it('surfaces a read error instead of an empty queue', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'eq', 'order']) chain[m] = () => chain
    chain.limit = async () => ({ data: null, error: { message: 'boom' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(listHeldCompletions({ from: () => chain } as any)).rejects.toThrow('boom')
  })
})
