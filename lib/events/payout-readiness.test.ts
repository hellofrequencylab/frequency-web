import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE PAYEE RESOLUTION IS THE WHOLE RISK HERE (ADR-819), so it is what these cases pin: a
// space-hosted event pays the space OWNER, not the organizer whose name is on it. Keying on
// `host_id` would tell a buyer the money will land when a different person's account is the one
// that has to exist -- and it would do so on exactly the events most likely to be priced.

const spacesIn = vi.fn()
const getConnectReadyMap = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ in: spacesIn }) }) }),
}))
vi.mock('@/lib/billing/connect', () => ({ getConnectReadyMap: (ids: string[]) => getConnectReadyMap(ids) }))

const { eventPayoutReadyMap, eventPayoutReadyOrUnknown } = await import('./payout-readiness')

beforeEach(() => {
  spacesIn.mockReset()
  getConnectReadyMap.mockReset()
  spacesIn.mockResolvedValue({ data: [], error: null })
  getConnectReadyMap.mockResolvedValue({})
})

describe('eventPayoutReadyMap', () => {
  it('reads a personal event against its HOST', async () => {
    getConnectReadyMap.mockResolvedValue({ 'host-1': true })
    const out = await eventPayoutReadyMap([{ id: 'e1', host_id: 'host-1', host_space_id: null }])
    expect(getConnectReadyMap).toHaveBeenCalledWith(['host-1'])
    expect(out).toEqual({ e1: true })
  })

  it('reads a SPACE-hosted event against the space OWNER, not the host (ADR-819)', async () => {
    spacesIn.mockResolvedValue({ data: [{ id: 's1', owner_profile_id: 'owner-9' }], error: null })
    // The organizer is ready; the owner is not. The money would route to the owner, so the answer
    // is not ready — this is the case a host_id-keyed map gets confidently wrong.
    getConnectReadyMap.mockResolvedValue({ 'host-1': true })
    const out = await eventPayoutReadyMap([{ id: 'e1', host_id: 'host-1', host_space_id: 's1' }])
    expect(getConnectReadyMap).toHaveBeenCalledWith(['owner-9'])
    expect(out).toEqual({})
  })

  it('takes ONE spaces read and ONE readiness read for a whole page', async () => {
    spacesIn.mockResolvedValue({
      data: [{ id: 's1', owner_profile_id: 'owner-9' }, { id: 's2', owner_profile_id: 'owner-8' }],
      error: null,
    })
    getConnectReadyMap.mockResolvedValue({ 'owner-9': true, 'host-2': true })
    const out = await eventPayoutReadyMap([
      { id: 'e1', host_id: 'h1', host_space_id: 's1' },
      { id: 'e2', host_id: 'host-2', host_space_id: null },
      { id: 'e3', host_id: 'h3', host_space_id: 's2' },
    ])
    expect(spacesIn).toHaveBeenCalledTimes(1)
    expect(getConnectReadyMap).toHaveBeenCalledTimes(1)
    expect(out).toEqual({ e1: true, e2: true })
  })

  it('skips both reads entirely for an empty page, and the spaces read when nothing is space-hosted', async () => {
    expect(await eventPayoutReadyMap([])).toEqual({})
    expect(getConnectReadyMap).not.toHaveBeenCalled()
    await eventPayoutReadyMap([{ id: 'e1', host_id: 'h1' }])
    expect(spacesIn).not.toHaveBeenCalled()
  })

  // FAIL CLOSED on every unknown: the cost of a false negative is a card with no price stat, and
  // the cost of a false positive is a stranger shown a number nobody can be paid.
  it('is absent (not ready) for an event with no resolvable payee', async () => {
    expect(await eventPayoutReadyMap([{ id: 'e1', host_id: null, host_space_id: null }])).toEqual({})
    expect(await eventPayoutReadyMap([{ id: 'e2', host_id: 'h', host_space_id: 'gone' }])).toEqual({})
  })

  it('is absent (not ready) when the hosting-space read errors', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    spacesIn.mockResolvedValue({ data: null, error: { message: 'boom' } })
    getConnectReadyMap.mockResolvedValue({ 'host-1': true })
    expect(await eventPayoutReadyMap([{ id: 'e1', host_id: 'host-1', host_space_id: 's1' }])).toEqual({})
    // The fail-safe SAYS SO. A silent one reads as "this host has not connected Stripe".
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('eventPayoutReadyOrUnknown', () => {
  it('answers true / false when the read works', async () => {
    getConnectReadyMap.mockResolvedValue({ h: true })
    expect(await eventPayoutReadyOrUnknown({ id: 'e1', host_id: 'h' })).toBe(true)
    getConnectReadyMap.mockResolvedValue({})
    expect(await eventPayoutReadyOrUnknown({ id: 'e1', host_id: 'h' })).toBe(false)
  })

  // 🔴 NOT `false`. A thrown read (no service-role key in a build, say) collapsed onto `false`
  // would tell eventSchema to DROP the Offer from every event's rich result at once.
  it('answers null when the read THROWS, so no caller publishes a verdict nobody checked', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    getConnectReadyMap.mockRejectedValue(new Error('SUPABASE_SERVICE_ROLE_KEY is not set'))
    expect(await eventPayoutReadyOrUnknown({ id: 'e1', host_id: 'h' })).toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
