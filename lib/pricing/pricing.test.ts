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
  planKeysWithAddons,
  SPACE_PLAN_LABEL,
  ADDON_ENTITLEMENT_KEYS,
  ADDON_KEYS,
  BILLING_MANAGED_KEYS,
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
import { formatCents, priceRow, memberTierRows, spacePlanRows } from './display'

describe('space tiers (collapsed to free/business/nonprofit · ADR-552)', () => {
  it('SPACE_PLANS is free < business ~ nonprofit', () => {
    expect([...SPACE_PLANS]).toEqual(['free', 'business', 'nonprofit'])
  })

  it('narrows unknown / null labels to free, and OLD labels to their new tier (transition shim)', () => {
    // The two paid tiers (+ free) pass through unchanged.
    expect(asSpacePlan('business')).toBe('business')
    expect(asSpacePlan('nonprofit')).toBe('nonprofit')
    expect(asSpacePlan('free')).toBe('free')
    // Retired legacy labels narrow forward: pro/practitioner/partner/whitelabel -> business; organization -> nonprofit.
    expect(asSpacePlan('pro')).toBe('business')
    expect(asSpacePlan('practitioner')).toBe('business')
    expect(asSpacePlan('partner')).toBe('business')
    expect(asSpacePlan('whitelabel')).toBe('business')
    expect(asSpacePlan('organization')).toBe('nonprofit')
    // Unknown / null -> free (default-deny).
    expect(asSpacePlan('nonsense')).toBe('free')
    expect(asSpacePlan(null)).toBe('free')
    expect(asSpacePlan(undefined)).toBe('free')
  })

  it('free grants nothing; the free wedge is NEVER an entitlement key', () => {
    expect(planEntitlementKeys('free')).toEqual([])
    expect(planEntitlementKeys('free')).not.toContain('crm.playbooks')
    // crm.autonomy (Phase 3) is a per-Space DIAL, never a tier grant.
    for (const plan of SPACE_PLANS) expect(planEntitlementKeys(plan)).not.toContain('crm.autonomy')
  })

  it('Business and Nonprofit are FULL depth and IDENTICAL at the key level (no AI keys)', () => {
    const full = ['crm', 'crm.playbooks', 'email', 'automation', 'multi_pipeline', 'reporting', 'team', 'whitelabel']
    for (const plan of ['business', 'nonprofit'] as const) {
      // exact set (order-independent)
      expect([...planEntitlementKeys(plan)].sort()).toEqual([...full].sort())
      const ents = planEntitlements(plan)
      // includes the marketing, team, and branding (old whitelabel) keys
      expect(ents.email).toBe(true)
      expect(ents.team).toBe(true)
      expect(ents.whitelabel).toBe(true)
      // but NEITHER tier bundles the AI resonance keys (the metered add-on)
      expect(ents['crm.resonance']).toBeUndefined()
      expect(ents['crm.resonance_ai']).toBeUndefined()
    }
    // The two full tiers grant the EXACT same key set.
    expect(planEntitlementKeys('nonprofit')).toEqual(planEntitlementKeys('business'))
  })

  it('AI is the SOLE metered add-on; its keys are the resonance depth and are in NO tier base', () => {
    expect([...ADDON_KEYS]).toEqual(['ai'])
    expect(ADDON_ENTITLEMENT_KEYS.ai).toEqual(['crm.resonance', 'crm.resonance_ai'])
    // No tier base contains the AI keys.
    for (const plan of SPACE_PLANS) {
      expect(planEntitlementKeys(plan)).not.toContain('crm.resonance')
      expect(planEntitlementKeys(plan)).not.toContain('crm.resonance_ai')
    }
  })

  it('planKeysWithAddons layers the AI add-on keys onto a tier base (the set-to-target source)', () => {
    // Business + AI: the full depth PLUS the resonance keys.
    const bizAi = planKeysWithAddons('business', ['ai'])
    expect(bizAi).toContain('email')
    expect(bizAi).toContain('whitelabel')
    expect(bizAi).toContain('crm.resonance')
    expect(bizAi).toContain('crm.resonance_ai')
    // Unknown add-on keys are dropped (default-deny); the result is just the tier base.
    expect(planKeysWithAddons('business', ['nope' as never])).toEqual([...planEntitlementKeys('business')])
  })

  it('BILLING_MANAGED_KEYS is the union of every tier key + the AI add-on key, minus the autonomy dial', () => {
    expect(BILLING_MANAGED_KEYS).toContain('crm')
    expect(BILLING_MANAGED_KEYS).toContain('crm.playbooks')
    // every marketing/team/branding key (now Business depth) is still covered
    expect(BILLING_MANAGED_KEYS).toContain('email')
    expect(BILLING_MANAGED_KEYS).toContain('automation')
    expect(BILLING_MANAGED_KEYS).toContain('multi_pipeline')
    expect(BILLING_MANAGED_KEYS).toContain('reporting')
    expect(BILLING_MANAGED_KEYS).toContain('team')
    expect(BILLING_MANAGED_KEYS).toContain('whitelabel')
    // and the AI resonance keys
    expect(BILLING_MANAGED_KEYS).toContain('crm.resonance')
    expect(BILLING_MANAGED_KEYS).toContain('crm.resonance_ai')
    // the per-Space dial is never billing-managed
    expect(BILLING_MANAGED_KEYS).not.toContain('crm.autonomy')
  })

  it('has a label for every tier (Business, Non Profit)', () => {
    for (const p of SPACE_PLANS) expect(typeof SPACE_PLAN_LABEL[p]).toBe('string')
    expect(SPACE_PLAN_LABEL.business).toBe('Business')
    expect(SPACE_PLAN_LABEL.nonprofit).toBe('Non Profit')
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

  it('tier ladder: free < crew (supporter still ranks as paid during the transition)', () => {
    expect(meetsGate(tierGate, { tier: 'free' })).toBe(false)
    expect(meetsGate(tierGate, { tier: 'crew' })).toBe(true)
    // Supporter is retired as a tier (ADR-458) but the rank still treats it as paid until the
    // member-tier collapse migration remaps it to crew, so a still-supporter row never loses access.
    expect(meetsGate(tierGate, { tier: 'supporter' })).toBe(true)
  })

  it('collapsed plan ladder: free < business ~ nonprofit (paid floor is business · ADR-552)', () => {
    expect(meetsGate(planGate, { plan: 'free' })).toBe(false)
    expect(meetsGate(planGate, { plan: 'business' })).toBe(true)
    expect(meetsGate(planGate, { plan: 'nonprofit' })).toBe(true)
  })

  it('legacy labels narrow through asSpacePlan, so they clear the business floor', () => {
    // meetsGate runs the plan through asSpacePlan, so a Space still carrying a legacy label resolves
    // to its new tier and clears the business gate (the transition shim, no regression).
    expect(meetsGate(planGate, { plan: 'pro' as never })).toBe(true)
    expect(meetsGate(planGate, { plan: 'practitioner' as never })).toBe(true)
    expect(meetsGate(planGate, { plan: 'whitelabel' as never })).toBe(true)
    expect(meetsGate(planGate, { plan: 'organization' as never })).toBe(true)
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

  // The exact gate wired into the Vault cash-in server action (app/(main)/crew/store/actions.ts, P3):
  // OFF must preserve today's behavior (free can still be checked by canCashIn above, the gate is a
  // no-op); when billing is live the gate applies the crew minimum (free blocked, paid allowed).
  it('vault_cash_in: OFF is a no-op (free allowed); ON blocks free, allows crew+', async () => {
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { billingLive: false })).toBe(true)
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { billingLive: true })).toBe(false)
    expect(await featureAllowed('vault_cash_in', { tier: 'crew' }, { billingLive: true })).toBe(true)
    expect(await featureAllowed('vault_cash_in', { tier: 'supporter' }, { billingLive: true })).toBe(true)
  })
})

describe('seeded defaults are sane (mirror the migration)', () => {
  it('crew is cheaper than supporter; annual saves vs 12x monthly', () => {
    expect(PRICING_DEFAULTS.tier.crew.monthly_cents).toBeLessThan(PRICING_DEFAULTS.tier.supporter.monthly_cents)
    const crew = PRICING_DEFAULTS.tier.crew
    expect(crew.annual_cents).not.toBeNull()
    expect(crew.annual_cents!).toBeLessThan(crew.monthly_cents * 12)
  })

  it('take-rate: free usage 5%, paying Business + Non Profit 3% (ADR-552 Phase 3)', () => {
    const t = PRICING_DEFAULTS.take_rate
    expect(t.free_bps).toBe(500) // free usage pays the higher rate (the self-funding trigger)
    expect(t.business_bps).toBe(300) // a paying Business pays the lower rate
    expect(t.nonprofit_bps).toBe(300)
    expect(t.free_bps).toBeGreaterThan(t.business_bps)
  })

  it('vera free cap is the spec value (10/day)', () => {
    expect(PRICING_DEFAULTS.vera_free_daily_cap.messages).toBe(10)
  })

  it('space plans carry a 14-day free trial (members have none)', () => {
    expect(PRICING_DEFAULTS.trial.days).toBe(14)
  })

  it('plan defaults reflect the collapsed launch numbers (business + nonprofit · ADR-552)', () => {
    const plan = PRICING_DEFAULTS.plan
    expect(plan.business.monthly_cents).toBe(4900) // $49
    expect(plan.business.annual_cents).toBe(49000) // $490
    expect(plan.nonprofit.monthly_cents).toBe(2900) // $29 (verified 501c3)
    expect(plan.nonprofit.annual_cents).toBe(29000) // $290
  })
})

describe('pricing display (P3 — what the upgrade/plan surfaces render)', () => {
  it('formats cents: whole dollars drop the cents, fractional keep two', () => {
    expect(formatCents(900)).toBe('$9')
    expect(formatCents(39000)).toBe('$390')
    expect(formatCents(950)).toBe('$9.50')
    expect(formatCents(200000)).toBe('$2,000')
  })

  it('priceRow carries labels + the raw cents (monthly/annual)', () => {
    const row = priceRow('business', 'Business', PRICING_DEFAULTS.plan.business)
    expect(row.key).toBe('business')
    expect(row.label).toBe('Business')
    expect(row.monthly).toBe('$49')
    expect(row.annual).toBe('$490')
    expect(row.monthlyCents).toBe(4900)
    expect(row.annualCents).toBe(49000)
  })

  it('memberTierRows lists Crew then Supporter from the operator values', () => {
    const rows = memberTierRows(PRICING_DEFAULTS)
    expect(rows.map((r) => r.key)).toEqual(['crew', 'supporter'])
    expect(rows[0].monthly).toBe('$9')
    expect(rows[0].annual).toBe('$90')
    expect(rows[1].monthly).toBe('$24')
  })

  it('spacePlanRows lists the paid ladder Business -> Non Profit (not free · ADR-552)', () => {
    const rows = spacePlanRows(PRICING_DEFAULTS)
    expect(rows.map((r) => r.key)).toEqual(['business', 'nonprofit'])
    expect(rows[0].label).toBe('Business')
    expect(rows[1].label).toBe('Non Profit')
    // both carry an annual line
    expect(rows.find((r) => r.key === 'business')?.annual).toBe('$490')
    expect(rows.find((r) => r.key === 'nonprofit')?.annual).toBe('$290')
  })
})
