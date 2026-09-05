import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-16 (2026-09-05). Marketing consent is never granted by omission: completeOnboarding
// records `email_marketing` as GRANTED only when the caller sends `emailOptIn: true`. It used to
// default an absent field to true, which put a "granted" row in the consent ledger for any caller
// that forgot the field (the sequence runner binding is exactly such a caller).

const { recordConsent, redirect } = vi.hoisted(() => ({ recordConsent: vi.fn(async () => {}), redirect: vi.fn() }))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/consent/consent', () => ({ recordConsent }))
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/qr/referral', () => ({ applyReferralAttribution: vi.fn(async () => {}), applyEntryPointConversion: vi.fn(async () => {}) }))
vi.mock('@/lib/onboarding/welcome', () => ({ postWelcomeForMember: vi.fn(async () => {}) }))
vi.mock('@/lib/qr/member-codes', () => ({ ensureMemberCodes: vi.fn(async () => {}) }))
vi.mock('@/lib/attribution/acquisition', () => ({ persistAcquisition: vi.fn(async () => {}) }))
vi.mock('@/lib/rewards/connector', () => ({ rewardConnectorJoinOnSignup: vi.fn(async () => {}) }))
vi.mock('@/lib/crm/lead-capture', () => ({
  LEAD_GRAB_COOKIE: 'fq_lead',
  parseLeadGrab: () => null,
  claimPendingLeadGrab: vi.fn(async () => {}),
  claimLeadOnSignup: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const profile = { display_name: null, handle: null, bio: null, avatar_url: null, nexus_region_id: null, meta: {} }
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = () => chain
    chain.update = () => chain
    chain.maybeSingle = async () => ({ data: { ...profile, id: 'profile-1' }, error: null })
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'auth-1', email: 'new@member.test' } } }) },
      from: () => chain,
      rpc: async () => ({ error: null }),
    }
  },
}))

import { completeOnboarding } from './actions'

const base = { displayName: 'New Member', handle: 'newmember', bio: '', avatarUrl: '', regionId: 'region-1' }

beforeEach(() => {
  recordConsent.mockClear()
})

describe('completeOnboarding: email_marketing consent', () => {
  it('records consent as WITHHELD when the field is omitted', async () => {
    await completeOnboarding(base)
    expect(recordConsent).toHaveBeenCalledWith('profile-1', 'email_marketing', false, 'onboarding')
  })

  it('records consent as withheld on an explicit false', async () => {
    await completeOnboarding({ ...base, emailOptIn: false })
    expect(recordConsent).toHaveBeenCalledWith('profile-1', 'email_marketing', false, 'onboarding')
  })

  it('records consent as granted only on an explicit true', async () => {
    await completeOnboarding({ ...base, emailOptIn: true })
    expect(recordConsent).toHaveBeenCalledWith('profile-1', 'email_marketing', true, 'onboarding')
  })
})
