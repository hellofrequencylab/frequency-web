import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE GIFT RECEIPT + THE FUND NOTICE (lib/billing/donation-receipt.ts, LIVE-344). A settled donation
// told nobody: not the donor, not the Space. Locks:
//   1. A signed-in gift enqueues TWO emails (donor + Space owner) and writes ONE bell row.
//   2. A SIGNED-OUT donor is still receipted, at the address Stripe collected, and the Space's bell
//      says "Someone" rather than naming nobody.
//   3. A donor with no address at all is logged, and the Space is still told.
//   4. An unreadable Space sends nothing and says so; nothing here throws.
//   5. The copy carries no em dash and says "payout account", never the processor's name.

const m = vi.hoisted(() => ({
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  accountEmails: new Map<string, string>(),
  profiles: new Map<string, { display_name: string | null }>(),
  spaces: new Map<string, Record<string, unknown>>(),
  asks: new Map<string, { fund_label: string | null }>(),
}))

// Only the SEND is stubbed. The receipt body is wrapped by the real `emailShell` (lib/email.ts),
// so what this file asserts about the rendered message is what a mailbox actually receives.
vi.mock('@/lib/email', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/email')>()),
  enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/profiles/account-email', () => ({
  profileAccountEmail: async (id: string) => m.accountEmails.get(id) ?? null,
}))
vi.mock('./stripe', () => ({ appUrl: () => 'https://freq.test', stripe: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') return { insert: (row: Record<string, unknown>) => m.notificationsInsert(row) }
      const store =
        table === 'profiles' ? m.profiles : table === 'spaces' ? m.spaces : table === 'space_donation_asks' ? m.asks : null
      if (!store) throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: (_c: string, id: string) => ({
            maybeSingle: async () => ({ data: (store as Map<string, unknown>).get(id) ?? null, error: null }),
          }),
        }),
      }
    },
  }),
}))

import { sendDonationReceipts, DONATION_RECEIVED_NOTIFICATION_TYPE } from './donation-receipt'

const gift = {
  id: 'gift-1',
  spaceId: 'space-1',
  askId: 'ask-1',
  donorProfileId: 'donor-1',
  amountCents: 2000,
  currency: 'usd',
  message: 'For the roof',
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountEmails.clear()
  m.accountEmails.set('donor-1', 'donor@example.test')
  m.accountEmails.set('owner-1', 'owner@example.test')
  m.profiles.clear()
  m.profiles.set('donor-1', { display_name: 'Ada Lovelace' })
  m.profiles.set('owner-1', { display_name: 'Grace Hopper' })
  m.spaces.clear()
  m.spaces.set('space-1', { owner_profile_id: 'owner-1', name: 'Blue Door', brand_name: null, slug: 'blue-door' })
  m.asks.clear()
  m.asks.set('ask-1', { fund_label: 'the roof fund' })
})

describe('sendDonationReceipts', () => {
  it('receipts the donor and tells the Space: two emails, one bell', async () => {
    await sendDonationReceipts(gift)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(2)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)

    const donor = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(donor.to).toBe('donor@example.test')
    expect(donor.subject).toBe('Your gift to Blue Door')
    expect(donor.text).toContain('$20')
    expect(donor.text).toContain('the roof fund')
    expect(donor.text).toContain('For the roof')

    const space = m.enqueueEmail.mock.calls[1][0] as Record<string, string>
    expect(space.to).toBe('owner@example.test')
    expect(space.subject).toBe('Ada Lovelace gave $20 to the roof fund')
    expect(space.text).toContain('payout account')
    expect(space.text).not.toContain('Stripe')

    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'owner-1',
      actor_id: 'donor-1',
      type: DONATION_RECEIVED_NOTIFICATION_TYPE,
      reference_type: 'space',
      reference_id: 'blue-door',
      body: 'gave $20 to the roof fund',
    })
  })

  it('a signed-out donor is receipted at the Stripe address and reads as Someone to the Space', async () => {
    await sendDonationReceipts({ ...gift, donorProfileId: null, donorEmail: 'guest@example.test' })
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).to).toBe('guest@example.test')
    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      actor_id: null,
      body: 'Someone gave $20 to the roof fund',
    })
  })

  it('a donor with NO address is logged, and the Space is still told', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendDonationReceipts({ ...gift, donorProfileId: null, donorEmail: null })
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).to).toBe('owner@example.test')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('an unreadable Space sends nothing, says so, and does not throw', async () => {
    m.spaces.clear()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendDonationReceipts(gift)).resolves.toBeUndefined()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a gift with no ask falls back to a plain fund name', async () => {
    await sendDonationReceipts({ ...gift, askId: null })
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).text).toContain('the fund')
  })

  it('writes no em dash', async () => {
    await sendDonationReceipts(gift)
    for (const call of m.enqueueEmail.mock.calls) {
      const p = call[0] as Record<string, string>
      expect(`${p.subject}${p.text}${p.html}`).not.toContain('—')
    }
  })
})
