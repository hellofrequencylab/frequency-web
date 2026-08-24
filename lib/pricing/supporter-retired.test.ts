import { describe, it, expect, vi, afterEach } from 'vitest'

// SUPPORTER IS OFF THE LADDER ENTIRELY. The founder's member ladder is exactly Member (free) and Crew
// (pay-what-you-want, from $4.99/mo). This file is the guard that it stays that way.
//
// The three halves, deliberately kept in one file so they are read together:
//
//   1. NOTHING SELLS OR SHOWS SUPPORTER (ADR-878). memberTierSellable('supporter') refuses even with
//      the flag ON, no display row or pricing-grid column carries it, no member surface renders a $12
//      price, and Crew renders ONE clean price with no crossed-out anchor.
//   2. THE RUNG ITSELF IS GONE (owner directive, 2026-08-24). It left the EntitlementTier union,
//      ENTITLEMENT_TIERS, ENTITLEMENT_LABEL, the isPaid matrix and the gamification flag map, and the
//      read-time `supporter -> crew` fold in deriveTier went with it.
//   3. NOBODY LOST ACCESS, because nobody could be holding it. The fold was removable only because its
//      drop condition was MEASURED: migration 20260915000100 narrowed profiles.membership_tier to
//      CHECK (membership_tier in ('free','crew')) and remapped every row, so the label is
//      unrepresentable in the column. §3 pins that migration, because it is the entire premise: if the
//      CHECK ever widened again, removing the fold would become a downgrade and this test must fail.
//
// ADR-458 retired Supporter as a TIER (it became the pay-what-you-want `profiles.is_supporter` badge).
// ADR-878 removed the sell + display surfaces. This change removes the label. The BADGE is NOT under
// test here and is NOT retired; it stays, and lib/billing/supporter.test.ts covers it. Retiring a rung
// is not retiring a way to give.

import { catalogConfigByKey, defaultCatalogConfig, earnsSupporterMark, PWYW_CONFIG_DEFAULT } from './catalog-config'
import { memberTierRows, priceRow } from './display'
import { deriveGamificationAccess } from './gamification'
import { resolveGamificationAccessWithFlags } from './gamification-access'
import { meetsGate, type FeatureGate } from './gates'
import { memberFeatureGrid, memberOfferings, type PricingGridInput } from './pricing-grid'
import { PRICING_DEFAULTS } from './settings'
import { PLACEHOLDER_MEMBER_PRICE_CENTS, tierPriceCents, tierPriceLabel } from './feature-tiers'
import { CREW_NOTE, pricingLadderSummary } from './pricing-page'
import { readFileSync } from 'node:fs'
import { deriveTier, isPaid, ENTITLEMENT_TIERS, ENTITLEMENT_LABEL } from '@/lib/core/entitlement'

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

// ── 2. The RUNG is gone from the type and every structure derived from it ───────────────────────

describe('the Supporter RUNG left the entitlement ladder (owner directive, 2026-08-24)', () => {
  it('the ladder is exactly two rungs, and neither is Supporter', () => {
    expect([...ENTITLEMENT_TIERS]).toEqual(['free', 'crew'])
    expect(Object.keys(ENTITLEMENT_LABEL).sort()).toEqual(['crew', 'free'])
    expect(ENTITLEMENT_LABEL).not.toHaveProperty('supporter')
    expect(Object.values(ENTITLEMENT_LABEL)).not.toContain('Supporter')
  })

  it('the read-time fold is gone: the retired label no longer resolves to a paid rung', () => {
    // Cast, because the label is not representable through the type any more. The compiler is the
    // first gate; this is the second, and it is the assertion that inverts the old §2.
    const retired = 'supporter' as unknown as 'crew'
    expect(deriveTier(retired)).not.toBe('crew')
    expect(isPaid(retired)).toBe(false)
    expect(deriveGamificationAccess(retired)).toBe('earn_only')
    expect(
      resolveGamificationAccessWithFlags({ membership_tier: 'supporter' }, {
        gamification_full_member: false,
        gamification_full_crew: true,
      }),
    ).toBe('earn_only')
  })

  it('a paid gate ranks the retired label LOWEST, never highest (default-deny, not fail-open)', () => {
    const gate: FeatureGate = { axis: 'tier', minEntitlement: 'crew', enabled: true }
    expect(meetsGate(gate, { tier: 'supporter' as unknown as 'crew' })).toBe(false)
    expect(meetsGate(gate, { tier: 'crew' })).toBe(true)
  })

  it('the retired label has no member price, and Crew still does', () => {
    expect(tierPriceCents('tier', 'supporter')).toBe(0)
    expect(tierPriceCents('tier', 'crew')).toBe(PLACEHOLDER_MEMBER_PRICE_CENTS.crew)
    expect(Object.keys(PLACEHOLDER_MEMBER_PRICE_CENTS).sort()).toEqual(['crew', 'free'])
  })
})

// ── 3. The premise: the column cannot hold the label ─────────────────────────────────────────────

describe('nobody could lose access, because the column cannot carry the label', () => {
  it('the member-tier collapse migration still CHECKs membership_tier to exactly free / crew', () => {
    // THE LOAD-BEARING ASSERTION. Removing the read-time fold is safe if and ONLY if the column
    // cannot hold the retired label. Measured live on 2026-08-24: the constraint reads
    // CHECK ((membership_tier = ANY (ARRAY['free','crew']))) and 0 of 56 profiles carry the label.
    // This pins the migration that put it there, so a future widening breaks the build rather than
    // quietly turning this retirement into a downgrade.
    const sql = readFileSync('supabase/migrations/20260915000100_pricing_member_tier.sql', 'utf8')
    expect(sql).toContain("check (membership_tier in ('free', 'crew'))")
    // And the same migration is what preserved the distinction it retired: the badge backfill.
    expect(sql).toContain("update public.profiles set is_supporter = true where membership_tier = 'supporter'")
  })
})

// ── 4. The BADGE is a different axis and is untouched ────────────────────────────────────────────

describe('the Supporter BADGE survives the rung (ADR-458 § the whole point)', () => {
  it('a contribution at or above the suggested amount still earns the mark', () => {
    // The pay-what-you-want contribution channel is how a member backs the Foundation on top of Crew.
    // It writes profiles.is_supporter, which is NOT membership_tier and was never a rung.
    const pwyw = PWYW_CONFIG_DEFAULT
    expect(earnsSupporterMark(pwyw.suggestedCents, pwyw)).toBe(true)
    expect(earnsSupporterMark(pwyw.suggestedCents - 1, pwyw)).toBe(false)
  })
})
