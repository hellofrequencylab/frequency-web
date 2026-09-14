import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE HOST'S MARK (PROG-GD4), the action half. What is pinned here and nowhere else:
//   * a host marks a guest RSVP seat and a guest ticket seat, and the write lands on the seat's
//     table with attended_at + attended_by;
//   * that write asks the admin client for NO other table (no engagement_events row) and calls no
//     reward, so the mark pays no Zaps: lib/zaps and lib/engagement/events are mocked to throw if
//     touched, and the test passes only because they never are;
//   * a caller who is neither host, cohost nor staff is refused with no write at all;
//   * a cohost passes, through the same seam the rest of the dashboard gates on.

type Call = { table: string; patch: Record<string, unknown>; filters: [string, string][] }

const fx = vi.hoisted(() => ({
  profileId: 'host-1' as string | null,
  host: true,
  cohost: false,
  calls: [] as Call[],
  tables: [] as string[],
  revalidated: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      fx.tables.push(table)
      return {
        update: (patch: Record<string, unknown>) => {
          const call: Call = { table, patch, filters: [] }
          fx.calls.push(call)
          const chain = {
            eq: (col: string, val: string) => {
              call.filters.push([col, val])
              return chain
            },
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
          }
          return chain
        },
      }
    },
    rpc: () => {
      throw new Error('the host mark must never call an rpc')
    },
  }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => fx.profileId }))
vi.mock('@/lib/events/host-gate', () => ({ viewerActsAsEventHost: async () => fx.host }))
vi.mock('@/lib/events/cohosts', () => ({ isEventCohost: async () => fx.cohost }))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => fx.revalidated.push(p) }))
// Tripwires: neither module is imported by the action, and this proves it stays that way.
vi.mock('@/lib/zaps', () => {
  throw new Error('the host mark must not import lib/zaps')
})
vi.mock('@/lib/engagement/events', () => {
  throw new Error('the host mark must not import the engagement ledger')
})

import { setSeatAttendedFromManage } from './attendance-actions'

beforeEach(() => {
  fx.profileId = 'host-1'
  fx.host = true
  fx.cohost = false
  fx.calls.length = 0
  fx.tables.length = 0
  fx.revalidated.length = 0
})

describe('setSeatAttendedFromManage', () => {
  it('a host marks a guest RSVP seat: the column lands on event_rsvps, nothing lands anywhere else', async () => {
    const res = await setSeatAttendedFromManage('event-1', 'moon-circle', { kind: 'rsvp', id: 'rsvp-guest' }, true)
    expect(res).toEqual({ ok: true })
    expect(fx.calls).toHaveLength(1)
    expect(fx.calls[0].table).toBe('event_rsvps')
    expect(fx.calls[0].patch.attended_by).toBe('host-1')
    expect(typeof fx.calls[0].patch.attended_at).toBe('string')
    expect(fx.calls[0].filters).toEqual([
      ['event_id', 'event-1'],
      ['id', 'rsvp-guest'],
    ])
    // 🔴 No ledger row and no Zaps: the only table the admin client was asked for is the seat's.
    expect(fx.tables).toEqual(['event_rsvps'])
    expect(fx.revalidated).toEqual(['/events/moon-circle/manage', '/events/moon-circle'])
  })

  it('a host marks a guest ticket holder: the column lands on event_tickets', async () => {
    const res = await setSeatAttendedFromManage('event-1', 'moon-circle', { kind: 'ticket', id: 'ticket-guest' }, true)
    expect(res.ok).toBe(true)
    expect(fx.tables).toEqual(['event_tickets'])
    expect(fx.calls[0].filters).toEqual([
      ['event_id', 'event-1'],
      ['id', 'ticket-guest'],
    ])
  })

  it('🔴 a signed-in member who is neither host nor cohost is refused, with no write', async () => {
    fx.host = false
    fx.cohost = false
    const res = await setSeatAttendedFromManage('event-1', 'moon-circle', { kind: 'rsvp', id: 'rsvp-guest' }, true)
    expect(res).toEqual({ ok: false, error: 'forbidden' })
    expect(fx.calls).toHaveLength(0)
    expect(fx.tables).toEqual([])
    expect(fx.revalidated).toEqual([])
  })

  it('signed out is refused, with no write', async () => {
    fx.profileId = null
    const res = await setSeatAttendedFromManage('event-1', 'moon-circle', { kind: 'rsvp', id: 'rsvp-guest' }, true)
    expect(res.ok).toBe(false)
    expect(fx.calls).toHaveLength(0)
  })

  it('a cohost passes through the cohost seam', async () => {
    fx.host = false
    fx.cohost = true
    const res = await setSeatAttendedFromManage('event-1', 'moon-circle', { kind: 'rsvp', id: 'rsvp-member' }, true)
    expect(res.ok).toBe(true)
    expect(fx.calls).toHaveLength(1)
  })

  it('a host can clear a mistaken mark', async () => {
    const res = await setSeatAttendedFromManage('event-1', 'moon-circle', { kind: 'rsvp', id: 'rsvp-guest' }, false)
    expect(res.ok).toBe(true)
    expect(fx.calls[0].patch).toEqual({ attended_at: null, attended_by: null })
  })
})
