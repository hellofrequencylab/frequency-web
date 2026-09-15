import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE TIPPER'S RECEIPT (lib/billing/tip-receipt.ts, LIVE-344). The recipient's half shipped on
// 2026-09-05 and the payer's did not. Locks:
//   1. One email to the tipper, naming who it went to, the amount, and their note.
//   2. A tip with no sender sends nothing (there is nobody to receipt) and is not an error.
//   3. A tipper with no address enqueues nothing and says so.
//   4. It repeats the zero-fee promise the recipient's message already makes, and carries no em dash.

const m = vi.hoisted(() => ({
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  accountEmails: new Map<string, string>(),
  profiles: new Map<string, { display_name: string | null; handle: string | null }>(),
}))

vi.mock('@/lib/email', () => ({ enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/profiles/account-email', () => ({
  profileAccountEmail: async (id: string) => m.accountEmails.get(id) ?? null,
}))
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

import { sendTipperReceipt } from './tip-receipt'

const tip = {
  id: 'tip-1',
  to_profile_id: 'host-1',
  from_profile_id: 'fan-1',
  amount_cents: 500,
  currency: 'usd',
  message: 'Thanks for Tuesday',
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountEmails.clear()
  m.accountEmails.set('fan-1', 'fan@example.test')
  m.profiles.clear()
  m.profiles.set('fan-1', { display_name: 'Ada Lovelace', handle: 'ada' })
  m.profiles.set('host-1', { display_name: 'Grace Hopper', handle: 'grace' })
})

describe('sendTipperReceipt', () => {
  it('enqueues exactly one receipt to the tipper', async () => {
    await sendTipperReceipt(tip)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    const p = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(p.to).toBe('fan@example.test')
    expect(p.subject).toBe('Your $5 tip to Grace Hopper')
    expect(p.text).toContain('Hi Ada Lovelace,')
    expect(p.text).toContain('Thanks for Tuesday')
    expect(p.text).toContain('https://freq.test/people/grace')
  })

  it('repeats the zero-fee promise and carries no em dash', async () => {
    await sendTipperReceipt(tip)
    const p = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(p.text).toContain('Frequency takes nothing from a tip')
    expect(`${p.subject}${p.text}${p.html}`).not.toContain('—')
  })

  it('a tip with no sender receipts nobody, and is not an error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendTipperReceipt({ ...tip, from_profile_id: null })
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('a tipper with no address enqueues nothing, says so, and does not throw', async () => {
    m.accountEmails.clear()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendTipperReceipt(tip)).resolves.toBeUndefined()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a recipient with no handle still gets a receipt, without the link', async () => {
    m.profiles.set('host-1', { display_name: 'Grace Hopper', handle: null })
    await sendTipperReceipt(tip)
    const p = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(p.text).not.toContain('/people/')
    expect(p.text).toContain('Grace Hopper')
  })
})
