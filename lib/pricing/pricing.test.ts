import { describe, it, expect } from 'vitest'
import { PWYW_CONFIG_DEFAULT } from './catalog-config'

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
import { PLACEHOLDER_METER_LIMITS } from './feature-meters'
import { formatCents, priceRow, memberTierRows, spacePlanRows } from './display'
import { catalogConfigByKey, defaultCatalogConfig } from './catalog-config'

describe('space tiers (Community Collective ladder · ADR-811)', () => {
  it('SPACE_PLANS is free < business < collective ~ nonprofit ~ independent (capability order)', () => {
    expect([...SPACE_PLANS]).toEqual(['free', 'business', 'collective', 'nonprofit', 'independent'])
  })

  it('narrows unknown / null labels to free, and OLD labels to their new tier (transition shim)', () => {
    // The first-class tiers (+ free) pass through unchanged.
    expect(asSpacePlan('business')).toBe('business')
    expect(asSpacePlan('collective')).toBe('collective')
    expect(asSpacePlan('nonprofit')).toBe('nonprofit')
    expect(asSpacePlan('independent')).toBe('independent')
    expect(asSpacePlan('free')).toBe('free')
    // Retired legacy labels narrow forward: pro/practitioner/partner -> business; organization -> nonprofit;
    // whitelabel -> independent (white-label is now the Independent tier, ADR-811).
    expect(asSpacePlan('pro')).toBe('business')
    expect(asSpacePlan('practitioner')).toBe('business')
    expect(asSpacePlan('partner')).toBe('business')
    expect(asSpacePlan('whitelabel')).toBe('independent')
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

  it('Business = run-your-practice depth; Collective/Non Profit add automation+team; Independent adds branding (ADR-811)', () => {
    const businessDepth = ['crm', 'crm.playbooks', 'email', 'reporting', 'space_full_website']
    expect([...planEntitlementKeys('business')].sort()).toEqual([...businessDepth].sort())
    // Collective (and Non Profit) = Business PLUS automation + multi_pipeline + team + program (ADR-865).
    const collectiveDepth = [...businessDepth, 'automation', 'multi_pipeline', 'team', 'program']
    expect([...planEntitlementKeys('collective')].sort()).toEqual([...collectiveDepth].sort())
    expect(planEntitlementKeys('nonprofit')).toEqual(planEntitlementKeys('collective'))
    // Independent = Collective depth PLUS branding (whitelabel), un-folded from Business.
    expect([...planEntitlementKeys('independent')].sort()).toEqual([...collectiveDepth, 'whitelabel'].sort())
    // Fences: white-label is NOT in Business/Collective; team is a Collective+ key, not Business.
    expect(planEntitlements('business').whitelabel).toBeUndefined()
    expect(planEntitlements('business').team).toBeUndefined()
    expect(planEntitlements('collective').team).toBe(true)
    expect(planEntitlements('independent').whitelabel).toBe(true)
    // No tier bundles the AI resonance keys (the metered add-on).
    for (const plan of SPACE_PLANS) {
      expect(planEntitlements(plan)['crm.resonance']).toBeUndefined()
      expect(planEntitlements(plan)['crm.resonance_ai']).toBeUndefined()
    }
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
    // Collective + AI: the Collective depth PLUS the resonance keys.
    const collAi = planKeysWithAddons('collective', ['ai'])
    expect(collAi).toContain('email')
    expect(collAi).toContain('team')
    expect(collAi).toContain('crm.resonance')
    expect(collAi).toContain('crm.resonance_ai')
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

  it('collaborator HOSTING opens at Business: only a free Space is below it', () => {
    // Collaboration is a LADDER, not a wall. Business hosts a metered few (basic collaboration);
    // Collective hosts unlimited. A locked preview converts badly, a used feature with a ceiling
    // converts well, so the floor moved down to Business and the depth moved to revenue splits.
    const gate = FEATURE_GATES.space_collaborators
    expect(gate).toEqual({ axis: 'plan', minEntitlement: 'business', enabled: true })
    expect(meetsGate(gate, { plan: 'free' })).toBe(false)
    expect(meetsGate(gate, { plan: 'business' })).toBe(true)
    expect(meetsGate(gate, { plan: 'collective' })).toBe(true)
    expect(meetsGate(gate, { plan: 'nonprofit' })).toBe(true)
    expect(meetsGate(gate, { plan: 'independent' })).toBe(true)
  })

  it('revenue splits are the Collective line: free + business are below it', () => {
    const gate = FEATURE_GATES.space_revenue_splits
    expect(gate).toEqual({ axis: 'plan', minEntitlement: 'collective', enabled: true })
    expect(meetsGate(gate, { plan: 'free' })).toBe(false)
    expect(meetsGate(gate, { plan: 'business' })).toBe(false)
    expect(meetsGate(gate, { plan: 'collective' })).toBe(true)
    expect(meetsGate(gate, { plan: 'nonprofit' })).toBe(true)
    expect(meetsGate(gate, { plan: 'independent' })).toBe(true)
  })

  it('unknown / missing entitlement ranks lowest (default-deny)', () => {
    expect(meetsGate(tierGate, {})).toBe(false)
    expect(meetsGate(planGate, { plan: null })).toBe(false)
  })
})

describe('mergeGate (DB override over code default, like mergeChrome)', () => {
  it('returns the code default when there is no override', () => {
    expect(mergeGate('space_memberships', {})).toEqual(FEATURE_GATES.space_memberships)
  })

  it('an override wins for min_entitlement and enabled', () => {
    const merged = mergeGate('space_memberships', { space_memberships: { minEntitlement: 'business', enabled: false } })
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
    expect(await featureAllowed('space_memberships', { tier: 'free', plan: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('vera_unlimited', { tier: 'free' }, { gatesLive: false })).toBe(true)
  })

  it('an unknown feature is ungated (default-allow for an undeclared key)', async () => {
    expect(await featureAllowed('never_declared', { tier: 'free' }, { gatesLive: true })).toBe(true)
  })

  // The exact gate wired into the Vault cash-in server action (app/(main)/crew/store/actions.ts, P3):
  // OFF must preserve today's behavior (free can still be checked by canCashIn above, the gate is a
  // no-op); when billing is live the gate applies the crew minimum (free blocked, paid allowed).
  it('vault_cash_in: OFF is a no-op (free allowed); ON blocks free, allows crew+', async () => {
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { gatesLive: false })).toBe(true)
    expect(await featureAllowed('vault_cash_in', { tier: 'free' }, { gatesLive: true })).toBe(false)
    expect(await featureAllowed('vault_cash_in', { tier: 'crew' }, { gatesLive: true })).toBe(true)
    expect(await featureAllowed('vault_cash_in', { tier: 'supporter' }, { gatesLive: true })).toBe(true)
  })
})

describe('seeded defaults are sane (mirror the migration)', () => {
  it('the member ladder is Member (free) and Crew alone; annual saves vs 12x monthly (ADR-878)', () => {
    // The founder's canonical ladder. `tier` carries exactly one priced rung, so no surface can read a
    // second member price out of the config, and `supporter` is not even a key here.
    expect(Object.keys(PRICING_DEFAULTS.tier)).toEqual(['crew'])
    expect(PRICING_DEFAULTS.tier).not.toHaveProperty('supporter')
    const crew = PRICING_DEFAULTS.tier.crew
    // 🔴 CREW IS PAY-WHAT-YOU-WANT (owner ruling). This is the FLOOR, not a price: the member picks
    // their own recurring amount at or above it. It was 900 while the offer had no fixed price at all.
    expect(crew.monthly_cents).toBe(PWYW_CONFIG_DEFAULT.minCents)
    expect(crew.annual_cents).not.toBeNull()
    expect(crew.annual_cents!).toBeLessThan(crew.monthly_cents * 12)
  })

  it('Crew ships ONE clean price: no struck $12 anchor in the code default (ADR-878)', () => {
    // The $12 anchor echoed the retired $12 Supporter tier. Crew carries no anchor: it is PWYW.
    expect(PRICING_DEFAULTS.tier.crew.list_cents).toBeUndefined()
    const row = priceRow('crew', 'Crew', PRICING_DEFAULTS.tier.crew)
    expect(row.list).toBeNull()
    expect(row.listCents).toBeNull()
    expect(row.monthly).toBe('$4.99')
    expect(row.annual).toBe('$49.90')
  })

  it('take-rate: the LIVE rungs are the network vector plus BOTH individual seller rates (ADR-914)', () => {
    const t = PRICING_DEFAULTS.take_rate
    // What actually charges (lib/billing/fees.ts): a Space pays its network-sourced rate, and only on a
    // sale the network sourced. Business 5% → Collective 3% → Non Profit 0% → Independent 0% (off the graph).
    expect(t.network_bps.business).toBe(500)
    expect(t.network_bps.collective).toBe(300)
    expect(t.network_bps.nonprofit).toBe(0)
    expect(t.network_bps.independent).toBe(0)
    // A free Space pays the HIGHEST rate, so an unresolved plan over-collects rather than charging 0%.
    expect(t.network_bps.free).toBeGreaterThan(t.network_bps.business)
    // TWO individual seller rungs (ADR-914): a free Member sells at 10%, Crew at 8%. Selling is free on
    // every tier, so the ladder is these numbers descending rather than a capability appearing.
    expect(t.member_free_bps).toBe(1000)
    expect(t.member_bps).toBe(800)
    // The whole ladder must descend monotonically, or a rung is being sold for nothing.
    expect(t.member_free_bps).toBeGreaterThan(t.member_bps)
    expect(t.member_bps).toBeGreaterThan(t.network_bps.business)
    // A free Space is held to the free-Member standard, so those two rungs are EQUAL: moving a sale into
    // a free Space must not change its rate. Only paying does.
    expect(t.member_free_bps).toBe(t.network_bps.free)
    // The legacy flat trio survives for read-safety on stored blobs only; no charging path reads it.
    expect(t.free_bps).toBe(500)
    expect(t.business_bps).toBe(300)
    expect(t.nonprofit_bps).toBe(300)
  })

  it('vera free cap is the spec value (10/day)', () => {
    // DERIVED, never typed (ADR-917): the operator overlay's default IS the meter's free rung, so the
    // number a member is shown and the number they hit cannot drift apart again.
    expect(PRICING_DEFAULTS.vera_free_daily_cap.messages).toBe(PLACEHOLDER_METER_LIMITS.vera_unlimited!.free)
  })

  it('space plans carry a 14-day free trial (members have none)', () => {
    expect(PRICING_DEFAULTS.trial.days).toBe(14)
  })

  it('plan defaults reflect the Community Collective launch numbers (ADR-811)', () => {
    // The ANCHOR IDIOM (ADR-463): monthly_cents is what is CHARGED, list_cents is the crossed-out
    // anchor above it. COLLECTIVE ALONE ships a beta rate (ADR-1067) — one unlisted offer, granted by
    // hand. Business, Non Profit and Independent are all plain list pricing.
    const plan = PRICING_DEFAULTS.plan
    expect(plan.business.monthly_cents).toBe(2900) // $29, charged, no beta rate
    expect(plan.business.annual_cents).toBe(29000) // $290, two months free
    // NO anchor at all, rather than an anchor equal to the charge: the model drops list_cents when
    // there is nothing to strike, which is what stops the card rendering "$29" crossed out over "$29".
    expect(plan.business.list_cents).toBeUndefined()
    expect(plan.collective.monthly_cents).toBe(4900) // $49 beta, charged
    expect(plan.collective.list_cents).toBe(7900) // $79 list
    expect(plan.nonprofit.monthly_cents).toBe(3900) // $39 flat, verified 501c3, no beta rate
    expect(plan.nonprofit.list_cents).toBeUndefined()
    expect(plan.independent.monthly_cents).toBe(24900) // ~$249 white-label (standalone), no beta rate
    expect(plan.independent.list_cents).toBeUndefined()
  })

  it('the settings plan prices MATCH the catalog amounts the checkout charges (no two-price drift)', () => {
    // The page reads the settings layer and the checkout resolves the catalog layer. If these two ever
    // disagree, /pricing promises a price the checkout will not honor. Business/Collective carry a beta
    // rate in both; Non Profit/Independent are flat in both.
    const cat = catalogConfigByKey(defaultCatalogConfig())
    const pairs = [
      [PRICING_DEFAULTS.plan.business, cat.business_base],
      [PRICING_DEFAULTS.plan.collective, cat.collective_base],
      [PRICING_DEFAULTS.plan.nonprofit, cat.nonprofit_seat],
      [PRICING_DEFAULTS.plan.independent, cat.independent_base],
    ] as const
    for (const [setting, item] of pairs) {
      expect(setting.monthly_cents).toBe(item.month.foundingCents)
      expect(setting.list_cents ?? setting.monthly_cents).toBe(item.month.listCents)
    }
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
    expect(row.monthly).toBe('$29')
    expect(row.annual).toBe('$290')
    expect(row.list).toBeNull() // no strike: there is no beta rate for it to sit under
    expect(row.monthlyCents).toBe(2900)
    expect(row.annualCents).toBe(29000)
  })

  it('memberTierRows is Crew alone, from the operator values, with no strike (ADR-878)', () => {
    const rows = memberTierRows(PRICING_DEFAULTS)
    expect(rows.map((r) => r.key)).toEqual(['crew'])
    // Crew is pay-what-you-want, so the operator value is a FLOOR and every member-facing figure reads
    // "from". A bare "$4.99" would quote the cheapest possible Crew as if it were the price.
    expect(rows[0].monthly).toBe('from $4.99')
    expect(rows[0].annual).toBe('from $49.90')
    expect(rows[0].list).toBeNull() // one clean price, never a crossed-out $12
  })

  it('no member row anywhere renders a $12 price (ADR-878)', () => {
    // The whole member ladder, priced. Nothing on it may read $12: that was the retired Supporter
    // rate AND the retired Crew anchor, and both are gone.
    const labels = memberTierRows(PRICING_DEFAULTS).flatMap((r) => [r.monthly, r.annual, r.list])
    expect(labels).not.toContain('$12')
    expect(memberTierRows(PRICING_DEFAULTS).some((r) => r.monthlyCents === 1200)).toBe(false)
    expect(memberTierRows(PRICING_DEFAULTS).some((r) => r.listCents === 1200)).toBe(false)
  })

  it('an operator-set anchor is still honored (the config decides, not the code)', () => {
    // Removing the DEFAULT anchor does not remove the capability: an operator who deliberately sets
    // tier.crew.list_cents at /admin/pricing still gets a strike, exactly as the plan rows do.
    const row = priceRow('crew', 'Crew', { monthly_cents: 900, annual_cents: 9000, list_cents: 1500 })
    expect(row.list).toBe('$15')
  })

  it('spacePlanRows lists the WHOLE paid ladder, in order (ADR-811)', () => {
    // betaActive is explicit now (ADR-880): the ladder resolves the way the checkout charges.
    const rows = spacePlanRows(PRICING_DEFAULTS, true)
    expect(rows.map((r) => r.key)).toEqual(['business', 'collective', 'nonprofit', 'independent'])
    expect(rows.map((r) => r.label)).toEqual(['Business', 'Collective', 'Non Profit', 'Independent'])
    // every paid plan carries an annual line (two months free)
    expect(rows.find((r) => r.key === 'business')?.annual).toBe('$290')
    expect(rows.find((r) => r.key === 'nonprofit')?.annual).toBe('$390')
    expect(rows.find((r) => r.key === 'independent')?.annual).toBe('$2,490')
    // an anchor reads only where the config carries one
    expect(rows.find((r) => r.key === 'collective')?.list).toBe('$79')
    expect(rows.find((r) => r.key === 'nonprofit')?.list).toBeNull()
  })
})
