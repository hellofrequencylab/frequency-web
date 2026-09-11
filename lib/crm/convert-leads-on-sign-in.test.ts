import { describe, it, expect, vi, beforeEach } from 'vitest'

// CONVERT-ON-SIGN-IN. `convert_signup_leads_for_me()` joins every unconverted `signup_leads` row
// held by the caller's PROVEN address to the profile it turned out to be. This module's only job is
// to call it safely from the auth callback, so what is worth pinning is the safety, not the SQL:
//   1. it calls the RPC by name, with no arguments (the function takes none — a typed address keys
//      nothing, ADR-854; it reads the proven one out of auth.users);
//   2. an `{ error }` reply is READ and logged, never thrown — supabase-js resolves rather than
//      throwing, which is exactly the failure mode that sat silent in guest-seat-claim for months;
//   3. a THROWN RPC is caught too;
//   4. nothing is ever returned, so it cannot influence where a sign-in lands (unlike its neighbour
//      claimGuestSeatsOnSignIn, which deliberately can).
// A failed conversion must never block authentication.

import { convertLeadsOnSignIn, type SessionClient } from './convert-leads-on-sign-in'

const rpc = vi.fn(async (_fn: string, _args?: Record<string, unknown>) => ({ error: null }))
const session = { rpc } as unknown as SessionClient

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('convertLeadsOnSignIn', () => {
  it('calls convert_signup_leads_for_me with no arguments', async () => {
    await convertLeadsOnSignIn(session)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('convert_signup_leads_for_me')
    expect(rpc.mock.calls[0][1]).toBeUndefined()
  })

  it('returns undefined on the happy path, so it can never steer the redirect', async () => {
    await expect(convertLeadsOnSignIn(session)).resolves.toBeUndefined()
  })

  it('swallows an { error } reply and logs it', async () => {
    rpc.mockResolvedValue({ error: { message: 'permission denied' } as unknown as null })
    await expect(convertLeadsOnSignIn(session)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('swallows a THROWN rpc and logs it', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'))
    await expect(convertLeadsOnSignIn(session)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('survives a client whose rpc resolves nothing at all', async () => {
    const voidSession = { rpc: vi.fn(async () => undefined) } as unknown as SessionClient
    await expect(convertLeadsOnSignIn(voidSession)).resolves.toBeUndefined()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('is safe to call twice: idempotence lives in the SQL, not here', async () => {
    await convertLeadsOnSignIn(session)
    await convertLeadsOnSignIn(session)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
