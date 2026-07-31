import { describe, it, expect, vi, afterEach } from 'vitest'

// SUPPORTER IS OFF THE SELLABLE LADDER (ADR-878). The founder's member ladder is exactly Member (free)
// and Crew (pay-what-you-want, from $4.99/mo). This file is the guard that it stays that way, and that retiring the SELL path did
// not cost a historical member a single unit of access.
//
// The two halves, deliberately kept in one file so they are read together:
//
//   1. NOTHING SELLS OR SHOWS SUPPORTER. memberTierSellable('supporter') refuses even with the flag ON,
//      no display row or pricing-grid column carries it, no member surface renders a $12 price, and
//      Crew renders ONE clean price with no crossed-out anchor.
//   2. NOTHING LOSES ACCESS. The read-time `supporter -> crew` mapping (ADR-458) still works, a
//      historical row still clears the paid gates, and deriveGamificationAccess('supporter') is still
//      'full'. Retiring a sell path must never be a downgrade.
//
// ADR-458 retired Supporter as a TIER (it became the pay-what-you-want `profiles.is_supporter` badge).
// ADR-878 removes what was left: the sell + display surfaces. The badge is NOT under test here; it
// stays, and lib/billing/supporter.test.ts covers it.

import { catalogConfigByKey, defaultCatalogConfig } from './catalog-config'
import { memberTierRows, priceRow } from './display'
import { deriveGamificationAccess } from './gamification'
import { resolveGamificationAccessWithFlags } from './gamification-access'
import { meetsGate, type FeatureGate } from './gates'
import { memberFeatureGrid, memberOfferings, type PricingGridInput } from './pricing-grid'
import { PRICING_DEFAULTS } from './settings'
import { PLACEHOLDER_MEMBER_PRICE_CENTS, tierPriceCents, tierPriceLabel } from './feature-tiers'
import { CREW_NOTE, pricingLadderSummary } from './pricing-page'
import { deriveTier, isPaid } from '@/lib/core/entitlement'

const input: PricingGridInput = {
  values: PRICING_DEFAULTS,
  catalog: catalogConfigByKey(defaultCatalogConfig()),
}

// ── 1. Nothing sells it ──────────────────────────────────────────────────────────────────────────
// settings.ts memoizes its reads with react `cache`, so the scenario resets the module registry and
// re-imports against freshly mocked dependencies (the pattern gates-live.test.ts uses).

/** Load lib/pricing/settings with billing FULLY live and EVERY per-tier switch flipped ON, which is
 *  the most permissive world the flags can describe. If Supporter is unsellable here, it is unsellable
 *  anywhere. */
async function loadSettingsWithEverythingOn() {
  vi.resetModules()
  vi.doMock('@/lib/billing/stripe', () => ({ billingEnabled: () => true }))
  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: (table: string) => {
        if (table === 'platform_flags') {
          return {
            select: () => ({
              in: async (_c: string, keys: string[]) => ({
                // Every flag ON, including the retired tier_supporter_enabled.
                data: keys.map((key) => ({ key, value: true })),
              }),
            }),
          }
        }
        if (table === 'pricing_settings') {
          return {
            select: async () => ({
              // A STORED tier.supporter row, as prod carries today. It must change nothing.
              data: [{ key: 'tier.supporter', value: { monthly_cents: 1200, annual_cents: 12000 } }],
              error: null,
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }),
  }))
  return await import('./settings')
}

afterEach(() => {
  vi.doUnmock('@/lib/billing/stripe')
  vi.doUnmock('@/lib/supabase/admin')
  vi.resetModules()
})

describe('the Supporter SELL path is closed (ADR-878)', () => {
  it('memberTierSellable("supporter") is FALSE even with billing live and the flag ON', async () => {
    const { billingLive, loadPricingFlags, memberTierSellable } = await loadSettingsWithEverythingOn()
    // Prove the permissive world is real: billing is live and the retired flag genuinely reads true.
    expect(await billingLive()).toBe(true)
    expect((await loadPricingFlags()).tier_supporter_enabled).toBe(true)
    // And Supporter still refuses. The code path is the belt; the flag default and the SQL are braces.
    expect(await memberTierSellable('supporter')).toBe(false)
    // Crew, in the same world, DOES sell. Without this the test above could pass for the wrong reason.
    expect(await memberTierSellable('crew')).toBe(true)
  })

  it('a STORED tier.supporter row cannot put a $12 member price back on a surface', async () => {
    const { getPricingValues } = await loadSettingsWithEverythingOn()
    const values = await getPricingValues()
    expect(values.tier).not.toHaveProperty('supporter')
    expect(Object.keys(values.tier)).toEqual(['crew'])
    // The rows a member surface renders, from those very values.
    const rows = memberTierRows(values)
    expect(rows.map((r) => r.key)).toEqual(['crew'])
    expect(rows.flatMap((r) => [r.monthly, r.annual, r.list])).not.toContain('$12')
  })
})

describe('the Supporter DISPLAY surfaces are gone (ADR-878)', () => {
  it('memberTierRows carries Crew alone', () => {
    expect(memberTierRows(PRICING_DEFAULTS).map((r) => r.key)).toEqual(['crew'])
  })

  it('the pricing grid has exactly two member columns, Member and Crew, and no Supporter', () => {
    expect(memberOfferings(input).map((o) => o.id)).toEqual(['member', 'crew'])
    expect(memberOfferings(input).map((o) => o.tier)).toEqual(['free', 'crew'])
    const columns = memberFeatureGrid(input).columns
    expect(columns.map((c) => c.id)).toEqual(['member', 'crew'])
    expect(columns.some((c) => c.tier === 'supporter')).toBe(false)
    expect(columns.some((c) => c.label === 'Supporter')).toBe(false)
    // Every cell is resolved per column, so two columns means two cells on every row.
    for (const group of memberFeatureGrid(input).groups) {
      for (const r of group.rows) expect(r.cells).toHaveLength(2)
    }
  })

  it('NO member surface renders a $12 price', () => {
    // The three places a member-facing dollar figure is shaped: the display rows, the pricing-grid
    // offerings, and the placeholder ladder the in-app gate teasers price from.
    const rowLabels = memberTierRows(PRICING_DEFAULTS).flatMap((r) => [r.monthly, r.annual, r.list])
    const offerLabels = memberOfferings(input).flatMap((o) => [o.monthly, o.yearly, o.listAnchor])
    const ladderLabels = ['free', 'crew'].map((t) => tierPriceLabel('tier', t))
    for (const label of [...rowLabels, ...offerLabels, ...ladderLabels]) {
      expect(label ?? '').not.toContain('$12')
    }
    expect(Object.values(PLACEHOLDER_MEMBER_PRICE_CENTS)).not.toContain(1200)
  })

  it('the member pricing COPY sells two rungs, not three, and quotes one Crew price', () => {
    // CREW_NOTE is the member paragraph every marketing + AIO surface interpolates (/pricing, the
    // home page, /llms.txt, the page-editor pricing template), so it is the one place to assert the
    // ladder reads correctly in prose.
    expect(CREW_NOTE.foundingLabel).toBe('$4.99') // the PWYW floor, not a price
    expect(CREW_NOTE).not.toHaveProperty('supporterLabel')
    expect(CREW_NOTE).not.toHaveProperty('listLabel') // the struck $12 anchor is gone
    expect(CREW_NOTE.line).not.toMatch(/Supporter/)
    expect(CREW_NOTE.line).not.toContain('$12')
    expect(CREW_NOTE.line).not.toContain('—') // CONTENT-VOICE: no em dashes

    // The answer-engine ladder summary, the citable version of the same ladder.
    const ladder = pricingLadderSummary().join('\n')
    expect(ladder).not.toMatch(/Supporter/)
    expect(ladder).not.toContain('$12')
    expect(ladder).toContain('- Member: Free.')
    expect(ladder).toContain('- Crew: from $4.99/mo')
  })

  it('Crew renders ONE price: no crossed-out anchor on any member surface', () => {
    expect(PRICING_DEFAULTS.tier.crew.list_cents).toBeUndefined()
    expect(priceRow('crew', 'Crew', PRICING_DEFAULTS.tier.crew).list).toBeNull()
    const crew = memberOfferings(input).find((o) => o.id === 'crew')!
    expect(crew.monthly).toBe('from $4.99/mo')
    // The yearly is ten months of the FLOOR, so it reads as a floor too. A member paying more monthly
    // pays ten times their own amount yearly; nothing here is the price, both are the minimum.
    expect(crew.yearly).toBe('from $49.90/yr')
    expect(crew.listAnchor).toBeNull()
    // No anchor means no beta line either: the honest note only ever rides a real strike.
    expect(crew.betaNote).toBeNull()
  })
})

// ── 2. Nothing loses access ──────────────────────────────────────────────────────────────────────

describe('a HISTORICAL supporter row keeps every unit of access (ADR-458 tolerance kept)', () => {
  it('deriveTier maps supporter -> crew at read time', () => {
    expect(deriveTier('supporter')).toBe('crew')
    expect(isPaid('supporter')).toBe(true)
  })

  it('deriveGamificationAccess("supporter") is still full', () => {
    expect(deriveGamificationAccess('supporter')).toBe('full')
    expect(
      resolveGamificationAccessWithFlags({ membership_tier: 'supporter' }, {
        gamification_full_member: false,
        gamification_full_crew: true,
        gamification_full_supporter: true,
      }),
    ).toBe('full')
  })

  it('a supporter row still clears the paid tier gates', () => {
    const gate: FeatureGate = { axis: 'tier', minEntitlement: 'crew', enabled: true }
    expect(meetsGate(gate, { tier: 'supporter' })).toBe(true)
  })

  it('a supporter row prices at CREW, never at the retired $12', () => {
    expect(tierPriceCents('tier', 'supporter')).toBe(PLACEHOLDER_MEMBER_PRICE_CENTS.crew)
    expect(tierPriceLabel('tier', 'supporter')).toBe('from $4.99/mo')
  })
})
