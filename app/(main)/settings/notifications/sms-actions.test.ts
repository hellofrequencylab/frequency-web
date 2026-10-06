import { describe, it, expect, beforeEach, vi } from 'vitest'

// sendSmsCode / verifySmsCode — the SMS opt-in doors (app/(main)/settings/notifications).
//
// Pinned here (SCAN-747):
//   1. sendSmsCode is throttled per member AND per phone BEFORE any ledger write or enqueue,
//      and refuses while the operator sms_enabled platform flag is OFF. Each code is a real
//      outbound text to a caller-typed number, so an unthrottled door is SMS pumping.
//   2. verifySmsCode is throttled before the ledger read, so a parallel burst of guesses
//      cannot slip past the per-code attempt cap (which is written back read-then-write).
//   3. The opted_in consent insert RESOLVES with { error } on a database failure. A failed
//      consent write must fail the action and must not flip sms_enabled on.

const mocks = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  isSmsProvisioned: vi.fn(),
  isSmsConsentTableReady: vi.fn(),
  smsEnabledFlag: vi.fn(),
  enqueueSms: vi.fn(),
  rateLimitOk: vi.fn(),
  revalidatePath: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/comms/sms', () => ({
  isSmsProvisioned: mocks.isSmsProvisioned,
  isSmsConsentTableReady: mocks.isSmsConsentTableReady,
}))
vi.mock('@/lib/platform-flags', () => ({ smsEnabledFlag: mocks.smsEnabledFlag }))
vi.mock('@/lib/comms/sms-send', () => ({ enqueueSms: mocks.enqueueSms }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: mocks.rateLimitOk }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: mocks.insert,
      upsert: (row: Record<string, unknown>, opts: unknown) => mocks.upsert(table, row, opts),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: mocks.maybeSingle }),
          }),
        }),
      }),
    }),
  }),
}))

import { sendSmsCode, verifySmsCode } from './sms-actions'
import { hashSmsCode, smsCodeKey } from '@/lib/comms/sms-verification'

const PHONE = '+15555550123'

function pendingRow(code: string, attempts = 0) {
  return {
    status: 'pending_verification',
    phone: PHONE,
    note: JSON.stringify({
      codeHash: hashSmsCode(code, PHONE, smsCodeKey()),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      attempts,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMyProfileId.mockResolvedValue('profile-1')
  mocks.isSmsProvisioned.mockReturnValue(true)
  mocks.isSmsConsentTableReady.mockResolvedValue(true)
  mocks.smsEnabledFlag.mockResolvedValue(true)
  mocks.rateLimitOk.mockResolvedValue(true)
  mocks.insert.mockResolvedValue({ error: null })
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.enqueueSms.mockResolvedValue(undefined)
})

describe('sendSmsCode — the throttle and the platform switch', () => {
  it('rate-limits per member AND per phone before any write or enqueue', async () => {
    const res = await sendSmsCode('555-555-0123')
    expect(res).toEqual({ data: { phone: PHONE } })
    expect(mocks.rateLimitOk).toHaveBeenCalledWith('sms-code:profile', 'profile-1', 3, '10 m')
    expect(mocks.rateLimitOk).toHaveBeenCalledWith('sms-code:phone', PHONE, 5, '1 d')
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueSms).toHaveBeenCalledTimes(1)
  })

  it('denies when the per-member window is exhausted: no pending row, no text', async () => {
    mocks.rateLimitOk.mockImplementation(async (bucket: string) => bucket !== 'sms-code:profile')
    const res = await sendSmsCode(PHONE)
    expect(res).toEqual({ error: 'Too many codes sent. Wait a few minutes and try again.' })
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.enqueueSms).not.toHaveBeenCalled()
  })

  it('denies when the per-phone window is exhausted, whoever the caller is', async () => {
    mocks.rateLimitOk.mockImplementation(async (bucket: string) => bucket !== 'sms-code:phone')
    const res = await sendSmsCode(PHONE)
    expect(res).toEqual({ error: 'Too many codes sent. Wait a few minutes and try again.' })
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.enqueueSms).not.toHaveBeenCalled()
  })

  it('refuses while the operator sms_enabled platform flag is OFF', async () => {
    mocks.smsEnabledFlag.mockResolvedValue(false)
    const res = await sendSmsCode(PHONE)
    expect(res).toEqual({ error: 'Texts are not turned on yet. Check back soon.' })
    expect(mocks.rateLimitOk).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.enqueueSms).not.toHaveBeenCalled()
  })

  it('refuses an anonymous caller before any gate is consulted', async () => {
    mocks.getMyProfileId.mockResolvedValue(null)
    const res = await sendSmsCode(PHONE)
    expect(res).toEqual({ error: 'Not signed in' })
    expect(mocks.rateLimitOk).not.toHaveBeenCalled()
    expect(mocks.enqueueSms).not.toHaveBeenCalled()
  })
})

describe('verifySmsCode — the guess throttle and the consent write', () => {
  it('rate-limits guesses before reading the ledger', async () => {
    mocks.rateLimitOk.mockResolvedValue(false)
    const res = await verifySmsCode('123456')
    expect(res).toEqual({
      error: 'Too many tries. Wait a few minutes and send yourself a new code.',
    })
    expect(mocks.rateLimitOk).toHaveBeenCalledWith('sms-verify:profile', 'profile-1', 10, '10 m')
    expect(mocks.maybeSingle).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('on a match writes the opted_in row and flips sms_enabled on', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: pendingRow('123456'), error: null })
    const res = await verifySmsCode('123456')
    expect(res).toEqual({ data: undefined })
    expect(mocks.insert).toHaveBeenCalledWith([
      expect.objectContaining({ profile_id: 'profile-1', phone: PHONE, status: 'opted_in' }),
    ])
    expect(mocks.upsert).toHaveBeenCalledWith(
      'notification_preferences',
      { profile_id: 'profile-1', sms_enabled: true },
      { onConflict: 'profile_id' },
    )
  })

  it('fails, and does NOT flip sms_enabled, when the opted_in insert resolves with an error', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: pendingRow('123456'), error: null })
    mocks.insert.mockResolvedValue({ error: { message: 'relation is read only' } })
    const res = await verifySmsCode('123456')
    expect(res).toEqual({ error: 'Could not save your opt-in. Try again.' })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('a wrong code records the miss and never writes consent', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: pendingRow('123456', 2), error: null })
    const res = await verifySmsCode('654321')
    expect(res).toEqual({ error: "That code didn't match. Check it and try again." })
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    const [rows] = mocks.insert.mock.calls[0] as [Array<{ status: string; note: string }>]
    expect(rows[0].status).toBe('pending_verification')
    expect(JSON.parse(rows[0].note).attempts).toBe(3)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
