import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// respond() in host-transfer-actions.ts (SCAN-698): the status-guarded update used to run with no
// returned rows and only an `if (error)` branch. A PostgREST PATCH that matches zero rows is not an
// error, so an accept that lost to a concurrent revoke or decline fell through to applyHost and
// moved events.host_space_id (the payee) after the offer was already resolved the other way.
// Pinned on a FAKE admin client whose update can report "matched zero rows".
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  /** The pending transfer the pre-read finds. */
  transfer: {
    id: 'xfer-1',
    event_id: 'event-1',
    to_space_id: 'space-2',
    initiated_by: 'host',
    requested_by: 'host-1',
    status: 'pending',
  } as Row | null,
  /** Rows the compare-and-set update returns: [] simulates a concurrent reply winning the race. */
  updatedRows: [{ id: 'xfer-1' }] as Row[],
  updates: [] as Array<{ table: string; payload: Row }>,
  notifications: [] as Row[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Row = {}
      let updating = false
      const chain = () => b
      for (const m of ['select', 'order', 'limit', 'eq', 'not', 'is']) b[m] = chain
      b.update = (payload: Row) => {
        updating = true
        state.updates.push({ table, payload })
        return b
      }
      b.insert = (payload: Row) => {
        if (table === 'notifications') state.notifications.push(payload)
        return Promise.resolve({ error: null })
      }
      b.maybeSingle = async () => ({
        data:
          table === 'event_host_transfers' ? state.transfer
          : table === 'events' ?
            { title: 'Moon Circle', slug: 'moon-circle', host_space_id: 'space-1', starts_at: null, ends_at: null }
          : null,
        error: null,
      })
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: updating && table === 'event_host_transfers' ? state.updatedRows : [],
          error: null,
        })
      return b
    },
  }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'steward-2' }))
// The caller runs the TARGET Space and does not host the event: the side that may accept.
vi.mock('@/lib/core/load-capabilities', () => ({ getEventCapabilities: async () => new Set() }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => ({ id: 'space-2', slug: 'target' }) }))
vi.mock('@/lib/events/placement', () => ({ listSpaceEventCreatorIds: async () => ['steward-2'] }))

import { isError } from '@/lib/action-result'
import { acceptEventHostTransfer } from './host-transfer-actions'

const eventWrites = () => state.updates.filter((u) => u.table === 'events')

beforeEach(() => {
  state.updates.length = 0
  state.notifications.length = 0
  state.updatedRows = [{ id: 'xfer-1' }]
})

describe('acceptEventHostTransfer is a compare-and-set on the pending row', () => {
  it('moves the host and notifies when the status flip landed on a row', async () => {
    const result = await acceptEventHostTransfer('xfer-1')
    expect(isError(result)).toBe(false)
    expect(eventWrites()).toEqual([{ table: 'events', payload: { host_space_id: 'space-2' } }])
    expect(state.notifications).toHaveLength(1)
  })

  it('refuses, never writes host_space_id and sends nothing when the flip matched zero rows', async () => {
    // The pre-read saw "pending"; a revoke or decline resolved it before our update ran.
    state.updatedRows = []
    const result = await acceptEventHostTransfer('xfer-1')
    expect(result).toEqual({ error: 'That host offer has already been resolved.' })
    expect(eventWrites()).toEqual([])
    expect(state.notifications).toEqual([])
  })
})
