import { describe, expect, it } from 'vitest'
import { planKeysWithAddons, SPACE_PLANS, SPACE_EMAIL_CUSTOM_IDENTITY_KEY } from '@/lib/pricing/plans'
import { spaceEmailIdentityPolicy } from './email-identity-policy'

const identity = { id: 'sender-1', spaceId: 'space-1', sendingVerified: true, paused: false }
const selected = { kind: 'space', identityId: identity.id } as const
const space = (plan: string, extra = {}) => ({ id: 'space-1', plan,
  entitlements: { billing: { [SPACE_EMAIL_CUSTOM_IDENTITY_KEY]: true }, ...extra } })

describe('Space email identity value ladder', () => {
  it.each(SPACE_PLANS)('maps %s through the existing paid capability catalog', (plan) => {
    const keys = planKeysWithAddons(plan, [])
    expect(keys.includes(SPACE_EMAIL_CUSTOM_IDENTITY_KEY)).toBe(plan !== 'free')
    const entitlements = { billing: Object.fromEntries(keys.map((key) => [key, true])) }
    expect(spaceEmailIdentityPolicy({ id: 'space-1', plan, entitlements }, selected, identity).allowed)
      .toBe(plan !== 'free')
  })
  it('keeps baseline Frequency sending available to free Spaces', () => {
    expect(spaceEmailIdentityPolicy({ id: 'space-1', plan: 'free' }, { kind: 'frequency' })).toEqual({ allowed: true })
  })
  it('does not confuse website ownership with paid email identity', () => {
    expect(spaceEmailIdentityPolicy({ id: 'space-1', plan: 'business', entitlements: { custom_domain: true } }, selected, identity).allowed).toBe(false)
  })
  it('honors operator revocation even when billing granted the capability', () => {
    expect(spaceEmailIdentityPolicy(space('business', { [SPACE_EMAIL_CUSTOM_IDENTITY_KEY]: false }), selected, identity).allowed).toBe(false)
  })
  it('holds a queued custom send after downgrade despite stale billing grants', () => {
    expect(spaceEmailIdentityPolicy(space('free'), selected, identity)).toEqual({ allowed: false, reason: 'paid_identity_required' })
  })
  it('defaults unknown plans and unreadable Space state to a hold', () => {
    expect(spaceEmailIdentityPolicy(space('invented'), selected, identity).allowed).toBe(false)
    expect(spaceEmailIdentityPolicy(null, selected, identity)).toEqual({ allowed: false, reason: 'space_unavailable' })
  })
  it.each([
    null,
    { ...identity, spaceId: 'other-space' },
    { ...identity, id: 'other-sender' },
    { ...identity, sendingVerified: false },
    { ...identity, paused: true },
  ])('holds unauthorized, unverified or paused identities', (loaded) => {
    expect(spaceEmailIdentityPolicy(space('business'), selected, loaded)).toEqual({ allowed: false, reason: 'identity_unavailable' })
  })
  it('requires an actual capability, without a billing-off free pass', () => {
    expect(spaceEmailIdentityPolicy({ id: 'space-1', plan: 'business', entitlements: {} }, selected, identity).allowed).toBe(false)
  })
})
