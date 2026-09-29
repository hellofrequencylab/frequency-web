// LIVE-549 (ADR-1581): the bucket-root guard. A malformed prefix would list every member's files.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

import { eraseExternalCopies, type ErasureAdmin } from './account-erasure'

describe('eraseExternalCopies', () => {
  it('refuses to list or remove anything when the auth user id is not a uuid', async () => {
    const list = vi.fn()
    const remove = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = {
      storage: { from: () => ({ list, remove }) },
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    } as unknown as ErasureAdmin
    const res = await eraseExternalCopies({ profileId: 'p', authUserId: '', stripeCustomerId: null }, { admin, stripe: null })
    expect(list).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(res.failures[0]).toMatch(/not a uuid/)
  })

  it('names billing-off as a failure rather than pretending the customer is gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = {
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: vi.fn() }) },
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    } as unknown as ErasureAdmin
    const res = await eraseExternalCopies(
      { profileId: 'p', authUserId: '11111111-2222-4333-8444-555555555555', stripeCustomerId: 'cus_1' },
      { admin, stripe: null },
    )
    expect(res.stripe).toBe('skipped')
    expect(res.failures.join(' ')).toMatch(/billing is not configured/)
  })
})
