import { describe, it, expect, beforeEach, vi } from 'vitest'

// FOUNDERS RESERVATION ACTION (reserveFoundingSpot). WAITLIST MODE invariant: reserving a
// founding spot ONLY writes a `contacts` lead and queues the double opt-in confirm email. It
// NEVER charges, no Stripe, no payment path is touched. What is locked here (all network-free;
// the contacts upsert, the confirm email, suppression, attribution, rate-limit, and the Stripe
// module are all mocked, mirroring the repo's action tests):
//   1. VALIDATION: an invalid email is refused with a friendly error and nothing is written.
//   2. PERSIST: a valid reservation upserts a `contacts` lead with source 'founders_waitlist',
//      the chosen tier in meta.founder_tier, and double_optin 'pending', then queues the confirm
//      email.
//   3. NO CHARGE: across a full reservation, no function on lib/billing/stripe is ever invoked
//      (the Stripe module is mocked with spies and asserted untouched).

// ── Spies via vi.hoisted so they exist when the hoisted vi.mock factories run. ──
const {
  contactsInsert,
  contactsUpdate,
  sendBetaConfirmEmail,
  buildBetaConfirmUrl,
  isSuppressed,
  resolveAcquisition,
  rateLimitOk,
  headers,
  // Stripe spies, asserted NEVER called.
  billingEnabled,
  priceFor,
  membershipAmount,
} = vi.hoisted(() => ({
  contactsInsert: vi.fn(),
  contactsUpdate: vi.fn(),
  sendBetaConfirmEmail: vi.fn(),
  buildBetaConfirmUrl: vi.fn(),
  isSuppressed: vi.fn(),
  resolveAcquisition: vi.fn(),
  rateLimitOk: vi.fn(),
  headers: vi.fn(),
  billingEnabled: vi.fn(),
  priceFor: vi.fn(),
  membershipAmount: vi.fn(),
}))

// Mutable scenario state the contacts mock reads.
let existingContact:
  | { id: string; consent_state: string; display_name: string | null; meta: unknown }
  | null = null

// The admin client `from('contacts')` query-builder mock. Mirrors the chain the action uses:
//   .select(...).ilike(...).maybeSingle()  (read)
//   .insert(...)                            (new lead)
//   .update(...).eq(...)                    (existing lead)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'contacts') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          // Per-space tenancy (ADR-624): root-scoped `.eq('space_id', root)`, then an exact
          // `.eq('email', …)` on the lowercased column (wildcard-safe; replaced the old ilike).
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingContact, error: null }),
            }),
          }),
        }),
        insert: async (row: unknown) => {
          contactsInsert(row)
          return { error: null }
        },
        update: (row: unknown) => {
          contactsUpdate(row)
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }),
}))

// Per-space tenancy (ADR-624): the action root-scopes its contact lookup via loadRootSpaceId.
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: vi.fn(async () => 'root-space') }))
vi.mock('@/lib/email', () => ({ sendBetaConfirmEmail }))
vi.mock('@/lib/beta-tokens', () => ({ buildBetaConfirmUrl }))
vi.mock('@/lib/suppression', () => ({ isSuppressed }))
vi.mock('@/lib/attribution/server', () => ({ resolveAcquisition }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk }))
vi.mock('next/headers', () => ({ headers }))
// Mock the WHOLE Stripe module with spies so we can assert NOTHING in it is ever called.
vi.mock('@/lib/billing/stripe', () => ({
  stripe: null,
  billingEnabled,
  priceFor,
  membershipAmount,
}))

import { reserveFoundingSpot } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  existingContact = null
  isSuppressed.mockResolvedValue(false)
  resolveAcquisition.mockResolvedValue({ channel: 'direct' })
  rateLimitOk.mockResolvedValue(true)
  buildBetaConfirmUrl.mockReturnValue('https://frequencylocal.com/beta/confirm?e=x&t=y')
  sendBetaConfirmEmail.mockResolvedValue(undefined)
  headers.mockResolvedValue(new Map([['x-forwarded-for', '203.0.113.7']]) as unknown as Headers)
})

function expectNoStripe() {
  expect(billingEnabled).not.toHaveBeenCalled()
  expect(priceFor).not.toHaveBeenCalled()
  expect(membershipAmount).not.toHaveBeenCalled()
}

describe('reserveFoundingSpot, validation', () => {
  it('rejects an invalid email and writes nothing (and never touches Stripe)', async () => {
    const r = await reserveFoundingSpot({ email: 'not-an-email', tier: 'member' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/valid email/i)
    expect(contactsInsert).not.toHaveBeenCalled()
    expect(contactsUpdate).not.toHaveBeenCalled()
    expect(sendBetaConfirmEmail).not.toHaveBeenCalled()
    expectNoStripe()
  })

  it('rejects an empty email', async () => {
    const r = await reserveFoundingSpot({ email: '   ', tier: 'supporter' })
    expect(r.ok).toBe(false)
    expect(contactsInsert).not.toHaveBeenCalled()
    expectNoStripe()
  })
})

describe('reserveFoundingSpot, persist (new lead)', () => {
  it('writes a contacts lead with source founders_waitlist, the chosen tier, double_optin pending, and queues the confirm email', async () => {
    const r = await reserveFoundingSpot({ email: 'Founder@Example.com', name: '  Sam  ', tier: 'patron' })
    expect(r.ok).toBe(true)

    expect(contactsInsert).toHaveBeenCalledTimes(1)
    const row = contactsInsert.mock.calls[0][0] as {
      email: string
      display_name: string | null
      consent_state: string
      source: string
      meta: Record<string, unknown>
    }
    // Email lowercased, name trimmed.
    expect(row.email).toBe('founder@example.com')
    expect(row.display_name).toBe('Sam')
    // Lead-only consent + source.
    expect(row.consent_state).toBe('unknown')
    expect(row.source).toBe('founders_waitlist')
    // The waitlist meta contract.
    expect(row.meta.founders_waitlist).toBe(true)
    expect(row.meta.founder_tier).toBe('patron')
    expect(row.meta.double_optin).toBe('pending')
    expect(row.meta.requested_at).toEqual(expect.any(String))
    expect(row.meta.acquisition).toBeDefined()

    // Double opt-in confirm email queued through the spine.
    expect(buildBetaConfirmUrl).toHaveBeenCalledTimes(1)
    expect(sendBetaConfirmEmail).toHaveBeenCalledTimes(1)
    expect(sendBetaConfirmEmail).toHaveBeenCalledWith({
      to: 'founder@example.com',
      confirmUrl: 'https://frequencylocal.com/beta/confirm?e=x&t=y',
    })

    // The whole point: no charge path was ever invoked.
    expectNoStripe()
  })

  it('falls back to the member tier when given an unknown tier value', async () => {
    const r = await reserveFoundingSpot({ email: 'a@b.com', tier: 'gold' as unknown as 'member' })
    expect(r.ok).toBe(true)
    const row = contactsInsert.mock.calls[0][0] as { meta: Record<string, unknown> }
    expect(row.meta.founder_tier).toBe('member')
    expectNoStripe()
  })
})

describe('reserveFoundingSpot, existing + edge cases', () => {
  it('updates an existing lead (source founders_waitlist, new tier) instead of inserting', async () => {
    existingContact = { id: 'c1', consent_state: 'unknown', display_name: 'Existing', meta: { acquisition: { channel: 'referral' } } }
    const r = await reserveFoundingSpot({ email: 'dupe@example.com', tier: 'supporter' })
    expect(r.ok).toBe(true)
    expect(contactsInsert).not.toHaveBeenCalled()
    expect(contactsUpdate).toHaveBeenCalledTimes(1)
    const row = contactsUpdate.mock.calls[0][0] as { source: string; meta: Record<string, unknown> }
    expect(row.source).toBe('founders_waitlist')
    expect(row.meta.founder_tier).toBe('supporter')
    // First-touch attribution preserved (resolveAcquisition not re-run).
    expect(resolveAcquisition).not.toHaveBeenCalled()
    expect(row.meta.acquisition).toEqual({ channel: 'referral' })
    expectNoStripe()
  })

  it('an already-confirmed contact gets their tier updated, no new email, returns already', async () => {
    existingContact = { id: 'c2', consent_state: 'subscribed', display_name: 'VIP', meta: {} }
    const r = await reserveFoundingSpot({ email: 'vip@example.com', tier: 'patron' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.already).toBe(true)
    expect(contactsUpdate).toHaveBeenCalledTimes(1)
    expect(sendBetaConfirmEmail).not.toHaveBeenCalled()
    expectNoStripe()
  })

  it('a suppressed address reports success without writing or emailing (no charge either)', async () => {
    isSuppressed.mockResolvedValueOnce(true)
    const r = await reserveFoundingSpot({ email: 'bounced@example.com', tier: 'member' })
    expect(r.ok).toBe(true)
    expect(contactsInsert).not.toHaveBeenCalled()
    expect(contactsUpdate).not.toHaveBeenCalled()
    expect(sendBetaConfirmEmail).not.toHaveBeenCalled()
    expectNoStripe()
  })

  it('rate-limited requests are refused before any write', async () => {
    rateLimitOk.mockResolvedValueOnce(false)
    const r = await reserveFoundingSpot({ email: 'fast@example.com', tier: 'member' })
    expect(r.ok).toBe(false)
    expect(contactsInsert).not.toHaveBeenCalled()
    expect(sendBetaConfirmEmail).not.toHaveBeenCalled()
    expectNoStripe()
  })
})
