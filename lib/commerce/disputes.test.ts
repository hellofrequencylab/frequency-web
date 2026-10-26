import { beforeEach, describe, expect, it, vi } from 'vitest'

// ORDER DISPUTES (ADR-598). Holds still: a blank reason opens nothing, a second live dispute on the
// same order is refused before any insert, text is trimmed to its caps, and a terminal status stamps
// who resolved it and when while 'reviewing' only advances the queue.

const m = vi.hoisted(() => ({
  live: null as Record<string, unknown> | null,
  inserted: [] as Record<string, unknown>[],
  insertResult: { data: { id: 'd-1' } as { id: string } | null, error: null as { message: string } | null },
  updates: [] as { patch: Record<string, unknown>; id: string }[],
  updateError: null as { message: string } | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const self: Record<string, unknown> = {
        select: () => self,
        eq: () => self,
        in: () => self,
        order: () => self,
        limit: () => self,
        maybeSingle: async () => ({ data: m.live, error: null }),
        insert: (row: Record<string, unknown>) => {
          m.inserted.push(row)
          return self
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_k: string, id: string) => {
            m.updates.push({ patch, id })
            return { error: m.updateError }
          },
        }),
      }
      // insert(...).select('id').maybeSingle() resolves to the insert result, not the live read.
      const baseMaybe = self.maybeSingle as () => Promise<unknown>
      self.maybeSingle = async () => (inserting ? m.insertResult : baseMaybe())
      let inserting = false
      const baseInsert = self.insert as (r: Record<string, unknown>) => unknown
      self.insert = (r: Record<string, unknown>) => {
        inserting = true
        return baseInsert(r)
      }
      return self
    },
  }),
}))

import { openDispute, setDisputeStatus } from './disputes'

beforeEach(() => {
  m.live = null
  m.inserted = []
  m.insertResult = { data: { id: 'd-1' }, error: null }
  m.updates = []
  m.updateError = null
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z'))
})

describe('openDispute', () => {
  it('opens nothing for a blank reason', async () => {
    expect(await openDispute({ orderId: 'o-1', openerProfileId: 'p-1', reason: '   ' })).toBeNull()
    expect(m.inserted).toEqual([])
  })

  it('refuses a second live dispute before it inserts', async () => {
    m.live = { id: 'd-0', order_id: 'o-1', status: 'open', reason: 'x', created_at: '2026-10-25T00:00:00Z' }
    expect(await openDispute({ orderId: 'o-1', openerProfileId: 'p-1', reason: 'Never arrived' })).toBeNull()
    expect(m.inserted).toEqual([])
  })

  it('trims and caps the text, then returns the new id', async () => {
    const id = await openDispute({
      orderId: 'o-1',
      openerProfileId: 'p-1',
      reason: `  ${'r'.repeat(300)}  `,
      detail: `  ${'d'.repeat(2500)}  `,
    })
    expect(id).toBe('d-1')
    expect(m.inserted).toHaveLength(1)
    expect((m.inserted[0].reason as string).length).toBe(200)
    expect((m.inserted[0].detail as string).length).toBe(2000)
    expect(m.inserted[0]).toMatchObject({ order_id: 'o-1', opener_profile_id: 'p-1' })
  })

  it('stores a blank detail as null and returns null when the insert fails', async () => {
    m.insertResult = { data: null, error: { message: 'unique violation' } }
    expect(await openDispute({ orderId: 'o-1', openerProfileId: 'p-1', reason: 'Late', detail: '  ' })).toBeNull()
    expect(m.inserted[0].detail).toBeNull()
  })
})

describe('setDisputeStatus', () => {
  it('stamps resolver and time on a terminal status', async () => {
    await setDisputeStatus('d-1', 'resolved_refund', { resolvedBy: 'admin-1', resolutionNote: '  Refunded in full ' })
    expect(m.updates[0].id).toBe('d-1')
    expect(m.updates[0].patch).toMatchObject({
      status: 'resolved_refund',
      resolved_by: 'admin-1',
      resolved_at: '2026-10-26T12:00:00.000Z',
      resolution_note: 'Refunded in full',
    })
  })

  it('stamps a cancelled dispute as resolved too, with a null resolver when none is given', async () => {
    await setDisputeStatus('d-1', 'cancelled')
    expect(m.updates[0].patch).toMatchObject({ status: 'cancelled', resolved_by: null })
    expect(m.updates[0].patch.resolved_at).toBe('2026-10-26T12:00:00.000Z')
  })

  it('only advances the queue on reviewing', async () => {
    await setDisputeStatus('d-1', 'reviewing')
    expect(m.updates[0].patch).toEqual({ status: 'reviewing', updated_at: '2026-10-26T12:00:00.000Z' })
  })

  it('throws the database message so the caller can show it', async () => {
    m.updateError = { message: 'row locked' }
    await expect(setDisputeStatus('d-1', 'resolved_denied')).rejects.toThrow('row locked')
  })
})
