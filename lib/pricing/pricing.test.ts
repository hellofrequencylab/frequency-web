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
import { formatCents, priceRow, memberTierRows, spacePlanRows } from './display'

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
    // Practitioner gets the CRM + the AI-depth playbooks lever (Phase 6 · ADR-387).
    expect(planEntitlementKeys('practitioner')).toContain('crm')
    expect(planEntitlementKeys('practitioner')).toContain('crm.playbooks')
    expect(planEntitlementKeys('business')).toContain('crm')
    expect(planEntitlementKeys('business')).toContain('email')
    // whitelabel includes everything business + org have, plus the whitelabel key
    expect(planEntitlementKeys('whitelabel')).toContain('whitelabel')
    expect(planEntitlementKeys('whitelabel')).toContain('crm')
  })

  it('the AI-depth keys ride the plan ladder cumulatively (Phase 6 · ADR-387)', () => {
    // The free wedge is NEVER an entitlement key (every Space gets it).
    expect(planEntitlementKeys('free')).not.toContain('crm.playbooks')
    // Practitioner+: governed playbooks; business+: the read-only resonance surface; org+/whitelabel:
    // the full Resonance Graph + managed matching.
    expect(planEntitlements('practitioner')['crm.playbooks']).toBe(true)
    expect(planEntitlements('practitioner')['crm.resonance']).toBeUndefined()
    expect(planEntitlements('business')['crm.resonance']).toBe(true)
    expect(planEntitlements('business')['crm.resonance_ai']).toBeUndefined()
    expect(planEntitlements('organization')['crm.resonance_ai']).toBe(true)
    expect(planEntitlements('whitelabel')['crm.resonance_ai']).toBe(true)
    // crm.autonomy (Phase 3) is a per-Space DIAL, never a plan grant.
    for (const plan of SPACE_PLANS) expect(planEntitlementKeys(plan)).not.toContain('crm.autonomy')
  })

  it('planEntitlements is exactly the { key: true } blob spaceHasEntitlement reads', () => {
    expect(planEntitlements('free')).toEqual({})
    expect(planEntitlements('practitioner')).toEqual({ crm: true, 'crm.playbooks': true })
    const biz = planEntitlements('business')
    expect(biz.crm).toBe(true)
    expect(biz.email).toBe(true)
  })

  it('has a label for every plan', () => {
    for (const p of SPACE_PLANS) expect(typeof SPACE_PLAN_LABEL[p]).toBe('string')
  })

  it('includes the nonprofit + partner plans on the capability ladder', () => {
    expect(SPACE_PLANS).toContain('nonprofit')
    expect(SPACE_PLANS).toContain('partner')
    expect(asSpacePlan('nonprofit')).toBe('nonprofit')
    expect(asSpacePlan('partner')).toBe('partner')
  })

  it('nonprofit + partner grant the full business toolset, NOT whitelabel / reporting', () => {
    for (const plan of ['nonprofit', 'partner'] as const) {
      const ents = planEntitlements(plan)
      // business-level capabilities
      expect(ents.crm).toBe(true)
      expect(ents.email).toBe(true)
      expect(ents.automation).toBe(true)
      expect(ents.team).toBe(true)
      expect(ents.multi_pipeline).toBe(true)
      // but NOT the org/whitelabel-only keys
      expect(ents.reporting).toBeUndefined()
      expect(ents.whitelabel).toBeUndefined()
      // keys reader agrees
      expect(planEntitlementKeys(plan)).not.toContain('reporting')
      expect(planEntitlementKeys(plan)).not.toContain('whitelabel')
    }
  })

  it('nonprofit + partner unlock exactly the business toolset (same key set)', () => {
    expect(planEntitlements('nonprofit')).toEqual(planEntitlements('business'))
    expect(planEntitlements('partner')).toEqual(planEntitlements('business'))
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

  it('nonprofit + partner rank ABOVE business: they clear a business-min gate', () => {
    // The capability ladder (SPACE_PLANS order) ranks nonprofit/partner over business ON PURPOSE,
    // so both clear the business-level feature gates (email / automation / team / multi-pipeline).
    expect(meetsGate(planGate, { plan: 'nonprofit' })).toBe(true)
    expect(meetsGate(planGate, { plan: 'partner' })).toBe(true)
  })

  it('nonprofit does NOT clear a whitelabel-min gate (full-featured, but not white-label)', () => {
    const whitelabelGate: FeatureGate = { axis: 'plan', minEntitlement: 'whitelabel', enabled: true }
    expect(meetsGate(whitelabelGate, { plan: 'nonprofit' })).toBe(false)
    expect(meetsGate(whitelabelGate, { plan: 'partner' })).toBe(false)
    expect(meetsGate(whitelabelGate, { plan: 'whitelabel' })).toBe(true)
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

  it('take-rate lives only on Free (5%); every paid plan is 0% (connection-based pricing)', () => {
    const t = PRICING_DEFAULTS.take_rate
    expect(t.free_bps).toBe(500)
    expect(t.practitioner_bps).toBe(0)
    expect(t.business_bps).toBe(0)
    expect(t.organization_bps).toBe(0)
  })

  it('vera free cap is the spec value (10/day)', () => {
    expect(PRICING_DEFAULTS.vera_free_daily_cap.messages).toBe(10)
  })

  it('space plans carry a 14-day free trial (members have none)', () => {
    expect(PRICING_DEFAULTS.trial.days).toBe(14)
  })

  it('plan defaults reflect the new launch numbers (practitioner/business/nonprofit/whitelabel setup)', () => {
    const plan = PRICING_DEFAULTS.plan
    expect(plan.practitioner.monthly_cents).toBe(1900) // $19
    expect(plan.practitioner.annual_cents).toBe(19000) // $190
    expect(plan.business.monthly_cents).toBe(4900) // $49
    expect(plan.business.annual_cents).toBe(49000) // $490
    expect(plan.nonprofit.monthly_cents).toBe(2900) // $29 (verified 501c3)
    expect(plan.nonprofit.annual_cents).toBe(29000) // $290
    expect(plan.organization.monthly_cents).toBe(19900) // $199, custom
    expect(plan.organization.annual_cents).toBeNull() // monthly-only
    expect(plan.whitelabel.monthly_cents).toBe(29900) // $299
    expect(plan.whitelabel.setup_cents).toBe(150000) // ~$1,500 one-time setup
  })
})

describe('pricing display (P3 — what the upgrade/plan surfaces render)', () => {
  it('formats cents: whole dollars drop the cents, fractional keep two', () => {
    expect(formatCents(900)).toBe('$9')
    expect(formatCents(39000)).toBe('$390')
    expect(formatCents(950)).toBe('$9.50')
    expect(formatCents(200000)).toBe('$2,000')
  })

  it('priceRow carries labels + the raw cents (monthly/annual/setup)', () => {
    const row = priceRow('whitelabel', 'White-label', PRICING_DEFAULTS.plan.whitelabel)
    expect(row.key).toBe('whitelabel')
    expect(row.label).toBe('White-label')
    expect(row.monthly).toBe('$299')
    expect(row.annual).toBeNull() // monthly-only
    expect(row.setup).toBe('$1,500')
    expect(row.monthlyCents).toBe(29900)
    expect(row.setupCents).toBe(150000)
  })

  it('memberTierRows lists Crew then Supporter from the operator values', () => {
    const rows = memberTierRows(PRICING_DEFAULTS)
    expect(rows.map((r) => r.key)).toEqual(['crew', 'supporter'])
    expect(rows[0].monthly).toBe('$9')
    expect(rows[0].annual).toBe('$90')
    expect(rows[1].monthly).toBe('$24')
  })

  it('spacePlanRows lists the paid ladder practitioner -> whitelabel (not free)', () => {
    const rows = spacePlanRows(PRICING_DEFAULTS)
    // Nonprofit (verified 501c3) rides between business and organization so an organization-type
    // Space can find its own plan on the ladder (the $199 organization plan is the enterprise tier).
    expect(rows.map((r) => r.key)).toEqual(['practitioner', 'business', 'nonprofit', 'organization', 'whitelabel'])
    expect(rows[0].label).toBe('Practitioner')
    // organization is monthly-only
    expect(rows.find((r) => r.key === 'organization')?.annual).toBeNull()
    // nonprofit has an annual line ($290)
    expect(rows.find((r) => r.key === 'nonprofit')?.annual).toBe('$290')
    // practitioner/business have an annual line
    expect(rows.find((r) => r.key === 'practitioner')?.annual).toBe('$190')
  })
})

describe('brand plan (connected custom-domain tier)', () => {
  const idx = (p: string) => (SPACE_PLANS as readonly string[]).indexOf(p)

  it('is a known plan, ranked above business and below the enterprise / white-label tiers', () => {
    expect((SPACE_PLANS as readonly string[]).includes('brand')).toBe(true)
    expect(asSpacePlan('brand')).toBe('brand')
    expect(idx('brand')).toBeGreaterThan(idx('business')) // clears business-level gates
    expect(idx('brand')).toBeLessThan(idx('organization')) // below enterprise
    expect(idx('brand')).toBeLessThan(idx('whitelabel')) // below full white-label
  })

  it('grants the business toolset plus custom_domain, without branding removal', () => {
    const keys = planEntitlementKeys('brand')
    expect(keys).toContain('custom_domain')
    expect(keys).toContain('email')
    expect(keys).toContain('automation')
    expect(keys).not.toContain('whitelabel') // brand stays connected; only white-label decouples
  })

  it('has a plain-voice label', () => {
    expect(SPACE_PLAN_LABEL.brand).toBe('Brand')
  })
})
