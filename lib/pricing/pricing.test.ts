import { describe, it, expect } from 'vitest'

// Pricing P1 (ADR-362, docs/PRICING.md) — the PURE entitlement helpers (no IO). These are the
// halves the admin console + the P2 webhook rely on; the IO readers (loadPricingSettings,
// loadFeatureGateOverrides, featureAllowed) are fail-safe wrappers exercised at their call sites.
// The headline invariant under test: OFF preserves current behavior (featureAllowed grants all).

import {
  SPACE_PLANS,
  asSpacePlan,
  planEntitlementKeys,
  planEntitlements,
  SPACE_PLAN_LABEL,
} from './plans'
import {
  deriveGamificationAccess,
  resolveGamificationAccess,
  asGamificationAccess,
} from './gamification'
import {
  FEATURE_GATES,
  meetsGate,
  mergeGate,
  featureAllowed,
  type FeatureGate,
} from './gates'
import { PRICING_DEFAULTS } from './settings'

describe('space plans', () => {
  it('narrows unknown / null labels to free (default-deny)', () => {
    expect(asSpacePlan('business')).toBe('business')
    expect(asSpacePlan('whitelabel')).toBe('whitelabel')
    expect(asSpacePlan('nonsense')).toBe('free')
    expect(asSpacePlan(null)).toBe('free')
    expect(asSpacePlan(undefined)).toBe('free')
  })

  it('expands plan -> entitlement keys cumulatively', () => {
    expect(planEntitlementKeys('free')).toEqual([])
    expect(planEntitlementKeys('practitioner')).toEqual(['crm'])
    expect(planEntitlementKeys('business')).toContain('crm')
    expect(planEntitlementKeys('business')).toContain('email')
    // whitelabel includes everything business + org have, plus the whitelabel key
    expect(planEntitlementKeys('whitelabel')).toContain('whitelabel')
    expect(planEntitlementKeys('whitelabel')).toContain('crm')
  })

  it('planEntitlements is exactly the { key: true } blob spaceHasEntitlement reads', () => {
    expect(planEntitlements('free')).toEqual({})
    expect(planEntitlements('practitioner')).toEqual({ crm: true })
    const biz = planEntitlements('business')
    expect(biz.crm).toBe(true)
    expect(biz.email).toBe(true)
  })

  it('has a label for every plan', () => {
    for (const p of SPACE_PLANS) expect(typeof SPACE_PLAN_LABEL[p]).toBe('string')
  })
})

describe('gamification access (the third flag)', () => {
  it('derives from billing tier by default: free = earn_only, paid = full', () => {
    expect(deriveGamificationAccess('free')).toBe('earn_only')
    expect(deriveGamificationAccess(null)).toBe('earn_only')
    expect(deriveGamificationAccess('crew')).toBe('full')
    expect(deriveGamificationAccess('supporter')).toBe('full')
  })

  it('asGamificationAccess only accepts the two known values', () => {
    expect(asGamificationAccess('full')).toBe('full')
    expect(asGamificationAccess('earn_only')).toBe('earn_only')
    expect(asGamificationAccess('nonsense')).toBeNull()
    expect(asGamificationAccess(null)).toBeNull()
  })

  it('override wins over the derived default (independent switch)', () => {
    // A free member comped to full
    expect(
      resolveGamificationAccess({ membership_tier: 'free', gamification_access_override: 'full' }),
    ).toBe('full')
    // A paying member held to earn_only
    expect(
      resolveGamificationAccess({ membership_tier: 'crew', gamification_access_override: 'earn_only' }),
    ).toBe('earn_only')
  })

  it('falls through to the derived tier when no override is set', () => {
    expect(resolveGamificationAccess({ membership_tier: 'free' })).toBe('earn_only')
    expect(resolveGamificationAccess({ membershipTier: 'crew' })).toBe('full')
    expect(resolveGamificationAccess(null)).toBe('earn_only')
    expect(resolveGamificationAccess({})).toBe('earn_only')
  })
})

describe('feature gate ladder math (meetsGate)', () => {
  const tierGate: FeatureGate = { axis: 'tier', minEntitlement: 'crew', enabled: true }
  const planGate: FeatureGate = { axis: 'plan', minEntitlement: 'business', enabled: true }

  it('tier ladder: free < crew < supporter', () => {
    expect(meetsGate(tierGate, { tier: 'free' })).toBe(false)
    expect(meetsGate(tierGate, { tier: 'crew' })).toBe(true)
    expect(meetsGate(tierGate, { tier: 'supporter' })).toBe(true)
  })

  it('plan ladder: free < practitioner < business < organization < whitelabel', () => {
    expect(meetsGate(planGate, { plan: 'practitioner' })).toBe(false)
    expect(meetsGate(planGate, { plan: 'business' })).toBe(true)
    expect(meetsGate(planGate, { plan: 'organization' })).toBe(true)
    expect(meetsGate(planGate, { plan: 'whitelabel' })).toBe(true)
  })

  it('a disabled gate never blocks', () => {
    expect(meetsGate({ ...tierGate, enabled: false }, { tier: 'free' })).toBe(true)
  })

  it('unknown / missing entitlement ranks lowest (default-deny)', () => {
    expect(meetsGate(tierGate, {})).toBe(false)
    expect(meetsGate(planGate, { plan: null })).toBe(false)
  })
})

describe('mergeGate (DB override over code default, like mergeChrome)', () => {
  it('returns the code default when there is no override', () => {
    expect(mergeGate('space_crm', {})).toEqual(FEATURE_GATES.space_crm)
  })

  it('an override wins for min_entitlement and enabled', () => {
    const merged = mergeGate('space_crm', { space_crm: { minEntitlement: 'business', enabled: false } })
    expect(merged?.minEntitlement).toBe('business')
    expect(merged?.enabled).toBe(false)
    // axis still comes from the code default
    expect(merged?.axis).toBe('plan')
  })

  it('builds a gate for a DB-only feature (no code default), inferring the axis from the label', () => {
    const planFeature = mergeGate('custom_thing', { custom_thing: { minEntitlement: 'business' } })
    expect(planFeature?.axis).toBe('plan')
    const tierFeature = mergeGate('custom_perk', { custom_perk: { minEntitlement: 'crew' } })
    expect(tierFeature?.axis).toBe('tier')
  })

  it('returns null for a feature with neither a code default nor a row', () => {
    expect(mergeGate('does_not_exist', {})).toBeNull()
  })
})

describe('featureAllowed — OFF preserves current behavior', () => {
  it('grants EVERYTHING when billing is not live (the OFF invariant)', async () => {
    // Even a free account on a gated feature is allowed while billing is OFF.
    expect(await featureAllowed('space_crm', { tier: 'free', plan: 'free' }, { billingLive: false })).toBe(true)
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { billingLive: false })).toBe(true)
    expect(await featureAllowed('vera_unlimited', { tier: 'free' }, { billingLive: false })).toBe(true)
  })

  it('an unknown feature is ungated (default-allow for an undeclared key)', async () => {
    expect(await featureAllowed('never_declared', { tier: 'free' }, { billingLive: true })).toBe(true)
  })
})

describe('seeded defaults are sane (mirror the migration)', () => {
  it('crew is cheaper than supporter; annual saves vs 12x monthly', () => {
    expect(PRICING_DEFAULTS.tier.crew.monthly_cents).toBeLessThan(PRICING_DEFAULTS.tier.supporter.monthly_cents)
    const crew = PRICING_DEFAULTS.tier.crew
    expect(crew.annual_cents).not.toBeNull()
    expect(crew.annual_cents!).toBeLessThan(crew.monthly_cents * 12)
  })

  it('take-rate decreases up the ladder (practitioner > business > org)', () => {
    const t = PRICING_DEFAULTS.take_rate
    expect(t.practitioner_bps).toBeGreaterThan(t.business_bps)
    expect(t.business_bps).toBeGreaterThan(t.organization_bps)
  })

  it('vera free cap is the spec value (10/day)', () => {
    expect(PRICING_DEFAULTS.vera_free_daily_cap.messages).toBe(10)
  })
})
