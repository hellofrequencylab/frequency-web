import { describe, it, expect, vi, beforeEach } from 'vitest'
import { claimGuestTicketsOnSignIn, type SessionClient } from './claim-guest-tickets-on-sign-in'

// CLAIM-ON-SIGN-IN, THE TICKET LEG (lib/events/claim-guest-tickets-on-sign-in.ts).
//
// It sits on the critical login path, inside the auth callback's swallowed block, so the whole
// contract is negative: it takes no arguments, it returns nothing, and NOTHING it can encounter may
// reach the caller. supabase-js resolves `{ error }` rather than throwing, so both shapes of failure
// are covered here: the resolved error (a permission denial, a function missing after migration
// drift) and the thrown one (transport). Both are logged, because a swallowed failure with no trace
// is an invisible regression, and this one stands between somebody and a ticket they paid for.
//
// The no-arguments assertion is the security property, not a style point. `claim_guest_tickets()`
// reads the caller's PROVEN address out of auth.users; a version that accepted a typed address
// would let anyone claim anyone's ticket (ADR-854).

function client(rpc: SessionClient['rpc']): SessionClient {
  return { rpc }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimGuestTicketsOnSignIn', () => {
  it('calls claim_guest_tickets with NO arguments', async () => {
    const rpc = vi.fn(async () => ({ error: null }))
    await claimGuestTicketsOnSignIn(client(rpc))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]).toEqual(['claim_guest_tickets'])
  })

  it('returns void and logs when the RPC resolves an error', async () => {
    const rpc = vi.fn(async () => ({ error: { message: 'permission denied for function claim_guest_tickets' } }))
    await expect(claimGuestTicketsOnSignIn(client(rpc))).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      '[guest-ticket-claim] claim_guest_tickets failed',
      expect.objectContaining({ message: expect.stringContaining('permission denied') }),
    )
  })

  it('returns void and logs when the RPC throws', async () => {
    const rpc = vi.fn(async () => {
      throw new Error('fetch failed')
    })
    await expect(claimGuestTicketsOnSignIn(client(rpc))).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      '[guest-ticket-claim] claim_guest_tickets threw',
      expect.objectContaining({ error: 'fetch failed' }),
    )
  })

  it('is quiet on the ordinary path, including a healthy claim of zero tickets', async () => {
    const rpc = vi.fn(async () => ({ error: null }))
    await claimGuestTicketsOnSignIn(client(rpc))
    expect(console.error).not.toHaveBeenCalled()
  })

  it('survives a client that resolves nothing at all', async () => {
    const rpc = vi.fn(async () => undefined)
    await expect(claimGuestTicketsOnSignIn(client(rpc))).resolves.toBeUndefined()
    expect(console.error).not.toHaveBeenCalled()
  })
})
