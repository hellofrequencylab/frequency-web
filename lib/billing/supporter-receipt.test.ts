import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE CONTRIBUTOR'S RECEIPT (lib/billing/supporter-receipt.ts, LIVE-344). A settled contribution used
// to flip a row, book a Foundation donation and turn a badge on, and tell nobody. Locks:
//   1. One email, one time, carrying the amount and the date.
//   2. A contribution with no profile enqueues nothing and says so.
//   3. A contributor with no address enqueues nothing and says so.
//   4. The copy keeps the two senses of "contribute" legible (docs/NAMING.md, ADR-1084): this is a
//      one-off gift that buys nothing, and it never reaches for the Crew pricing frame.

const m = vi.hoisted(() => ({
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  accountEmail: null as string | null,
  profiles: new Map<string, { display_name: string | null }>(),
}))

vi.mock('@/lib/email', () => ({ enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: async () => m.accountEmail }))
vi.mock('./stripe', () => ({ appUrl: () => 'https://freq.test', stripe: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: m.profiles.get(id) ?? null, error: null }) }),
      }),
    }),
  }),
}))

import { sendSupporterContributionReceipt } from './supporter-receipt'

const contribution = { id: 'c-1', profileId: 'member-1', amountCents: 2500, currency: 'usd' }

beforeEach(() => {
  vi.clearAllMocks()
  m.accountEmail = 'member@example.test'
  m.profiles.clear()
  m.profiles.set('member-1', { display_name: 'Ada Lovelace' })
})

describe('sendSupporterContributionReceipt', () => {
  it('enqueues exactly one receipt, with the amount and the date', async () => {
    await sendSupporterContributionReceipt(contribution)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    const p = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(p.to).toBe('member@example.test')
    expect(p.subject).toBe('Your contribution to Frequency')
    expect(p.text).toContain('Hi Ada Lovelace,')
    expect(p.text).toContain('$25')
    expect(p.text).toContain('https://freq.test/settings/billing')
  })

  it('says the contribution buys nothing, and never prices Crew', async () => {
    await sendSupporterContributionReceipt(contribution)
    const text = (m.enqueueEmail.mock.calls[0][0] as Record<string, string>).text
    expect(text).toContain('buys nothing extra')
    expect(text).not.toMatch(/contribute what you want/i)
    expect(text).not.toContain('—')
  })

  it('a contribution with no profile enqueues nothing and says so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendSupporterContributionReceipt({ ...contribution, profileId: null })
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a contributor with no address enqueues nothing, says so, and does not throw', async () => {
    m.accountEmail = null
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendSupporterContributionReceipt(contribution)).resolves.toBeUndefined()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
