import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// The two readers of rsvp-depth that a person's admission rides on (scan-2 L5-10, L5-15).
//
//   * approveRsvpById used to return void and drop the update's error, so a refused write was
//     reported as an approval and the "you're in" notice went out over a pending row. It now reads
//     the error, selects the row it touched, and says `ok: false` for a refusal AND for a predicate
//     that matched nothing.
//   * eventRequiresApproval used to admit on a read error (documented as the fail-safe direction).
//     It now fails CLOSED: an error or a missing row reads as "requires approval", because a
//     pending request can be approved later and a disclosed venue cannot be un-seen.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  /** What the event_rsvps update resolves with (after .select('id')). */
  update: { data: [{ id: 'rsvp-1' }] as Row[] | null, error: null as { message: string } | null },
  /** What the events maybeSingle resolves with. */
  event: { data: { rsvp_requires_approval: false } as Row | null, error: null as { message: string } | null },
  /** The predicates the update ran through, in order. */
  eqs: [] as Array<[string, unknown]>,
  updates: [] as Row[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Row = {}
      b.select = () => (table === 'event_rsvps' ? Promise.resolve(state.update) : b)
      b.update = (payload: Row) => {
        state.updates.push(payload)
        return b
      }
      b.eq = (col: string, val: unknown) => {
        state.eqs.push([col, val])
        return b
      }
      b.maybeSingle = () => Promise.resolve(state.event)
      return b
    },
  }),
}))

import { approveRsvpById, eventRequiresApproval } from './rsvp-depth'

beforeEach(() => {
  state.update = { data: [{ id: 'rsvp-1' }], error: null }
  state.event = { data: { rsvp_requires_approval: false }, error: null }
  state.eqs.length = 0
  state.updates.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('approveRsvpById (L5-10)', () => {
  it('returns ok when the update lands on the row', async () => {
    expect(await approveRsvpById('event-1', 'rsvp-1')).toEqual({ ok: true })
    expect(state.updates).toEqual([{ approval_status: 'approved' }])
    // Event id is still matched, so a row id from another event cannot be approved here.
    expect(state.eqs).toEqual([
      ['event_id', 'event-1'],
      ['id', 'rsvp-1'],
    ])
  })

  it('🔴 a refused update is NOT an approval: ok is false and the error is carried', async () => {
    state.update = { data: null, error: { message: 'permission denied for table event_rsvps' } }
    const result = await approveRsvpById('event-1', 'rsvp-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('permission denied')
  })

  it('a predicate that matched nothing (stale id, wrong event) is ok: false too', async () => {
    state.update = { data: [], error: null }
    const result = await approveRsvpById('event-1', 'rsvp-gone')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/could not be found/)
  })

  it('a refused update with an empty message still carries a human error', async () => {
    state.update = { data: null, error: { message: '' } }
    const result = await approveRsvpById('event-1', 'rsvp-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})

describe('eventRequiresApproval (L5-15) fails CLOSED', () => {
  it('reads the column when the row is there', async () => {
    state.event = { data: { rsvp_requires_approval: true }, error: null }
    expect(await eventRequiresApproval('event-1')).toBe(true)
    state.event = { data: { rsvp_requires_approval: false }, error: null }
    expect(await eventRequiresApproval('event-1')).toBe(false)
    state.event = { data: { rsvp_requires_approval: null }, error: null }
    expect(await eventRequiresApproval('event-1')).toBe(false)
  })

  it('🔴 a read ERROR requires approval (the request can be approved later; an admission cannot be un-seen)', async () => {
    state.event = { data: null, error: { message: 'connection reset' } }
    expect(await eventRequiresApproval('event-1')).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })

  it('🔴 a MISSING row requires approval', async () => {
    state.event = { data: null, error: null }
    expect(await eventRequiresApproval('event-1')).toBe(true)
  })
})
