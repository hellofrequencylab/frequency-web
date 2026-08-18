import { describe, it, expect } from 'vitest'

// ADR-1061 — THE PRIVATE BETA PRICE GRANT.
//
// The owner closed the beta window (ADR-1060) and then, the same day: *"I still have a couple people
// that I've offered the Beta pricing to, and I want to keep that open for them. But I don't want to
// advertise that Beta pricing as a package on the website. I just want regular pricing."*
//
// Two claims this file has to hold apart, in both directions:
//
//   1. A GRANTED Space is CHARGED the founding rate; an ungranted one is charged list; and a Space
//      that already holds a lock re-bills the lock whatever the grant says.
//   2. NO PUBLIC SURFACE MOVES. A visitor sees $79 and no beta framing whether or not a granted Space
//      exists. The second half is the one a future "helpful" change breaks, so it is asserted as a
//      LEAK test (the granted amount must appear nowhere on the public grid) rather than as a
//      tautological comparison of a pure function against itself.

import {
  loadoutChargeArm,
  loadoutChargePriceKey,
  effectiveCatalogAmounts,
  isBetaPricingActive,
  type LoadoutChargeArm,
} from './beta'
import { catalogConfigByKey, defaultCatalogConfig } from './catalog-config'
import { effectiveTierPrice, spacePlanRows } from './display'
import { spaceFeatureGrid, spaceOfferings, type PricingGridInput } from './pricing-grid'
import {
  loadoutStrip,
  pricingLadderSummary,
  pricingTiers,
  tierHeadline,
  tierListAnchor,
} from './pricing-page'
import { PRICING_DEFAULTS } from './settings'
import { catalogAmounts } from '@/lib/billing/pricing-keys'

const catalog = catalogConfigByKey(defaultCatalogConfig())

/** The world as it is since 2026-08-17: the beta window is SHUT. Every arm below is decided inside it,
 *  because a grant that only worked while the window was open would be worth nothing. */
const WINDOW_SHUT = false

describe('loadoutChargeArm — the charge decision, three arms', () => {
  it('LOCK: a Space holding a locked price re-bills it, grant or no grant, window or no window', () => {
    for (const spaceHasBetaGrant of [true, false]) {
      for (const betaActive of [true, false]) {
        expect(
          loadoutChargeArm({ lockedPriceId: 'price_locked_49', betaActive, spaceHasBetaGrant }),
          `grant=${spaceHasBetaGrant} window=${betaActive}`,
        ).toBe('lock')
      }
    }
  })

  it('FOUNDING: a granted Space gets the founding rate with the window SHUT', () => {
    expect(
      loadoutChargeArm({ lockedPriceId: null, betaActive: WINDOW_SHUT, spaceHasBetaGrant: true }),
    ).toBe('founding')
  })

  it('LIST: an ungranted Space with the window shut pays list — the default for everyone', () => {
    expect(
      loadoutChargeArm({ lockedPriceId: null, betaActive: WINDOW_SHUT, spaceHasBetaGrant: false }),
    ).toBe('list')
  })

  it('FOUNDING: the open window still grants it to everyone, so the grant did not replace the window', () => {
    expect(loadoutChargeArm({ lockedPriceId: null, betaActive: true, spaceHasBetaGrant: false })).toBe(
      'founding',
    )
  })

  it('a blank or whitespace lock is NOT a lock — a malformed row never reaches Stripe as a price id', () => {
    for (const lockedPriceId of [null, undefined, '', '   ']) {
      expect(
        loadoutChargeArm({ lockedPriceId, betaActive: WINDOW_SHUT, spaceHasBetaGrant: false }),
        JSON.stringify(lockedPriceId),
      ).toBe('list')
    }
  })
})

describe('loadoutChargePriceKey — the arm resolves a REAL, DIFFERENT Stripe price key', () => {
  // Non-vacuity: the two arms must resolve DIFFERENT keys. A grant that resolved the same key as list
  // would pass every arm test above and charge $79 anyway.
  const armFor = (spaceHasBetaGrant: boolean): Exclude<LoadoutChargeArm, 'lock'> =>
    loadoutChargeArm({ lockedPriceId: null, betaActive: WINDOW_SHUT, spaceHasBetaGrant }) as Exclude<
      LoadoutChargeArm,
      'lock'
    >

  it('a granted Space resolves the FOUNDING key and an ungranted one the _list key, monthly and yearly', () => {
    for (const interval of ['month', 'year'] as const) {
      expect(loadoutChargePriceKey('collective_base', interval, armFor(true))).toBe(
        `collective_base_${interval}`,
      )
      expect(loadoutChargePriceKey('collective_base', interval, armFor(false))).toBe(
        `collective_base_${interval}_list`,
      )
      expect(loadoutChargePriceKey('business_base', interval, armFor(true))).toBe(
        `business_base_${interval}`,
      )
      expect(loadoutChargePriceKey('business_base', interval, armFor(false))).toBe(
        `business_base_${interval}_list`,
      )
    }
  })

  it('those two keys carry the two amounts the owner actually promised and publishes', () => {
    // The grant is only worth something if the founding key is a LOWER number than the list key.
    expect(catalogAmounts('collective_base', 'month').foundingCents).toBe(4900) // promised
    expect(catalogAmounts('collective_base', 'month').listCents).toBe(7900) // published
    expect(catalogAmounts('collective_base', 'year').foundingCents).toBe(49000) // two months free
    expect(catalogAmounts('collective_base', 'year').listCents).toBe(79000)
    // Business carries NO beta rate (ADR-1067): both keys mean the same money, so a grant on a
    // Business Space cannot mis-price it downward.
    expect(catalogAmounts('business_base', 'month').foundingCents).toBe(2900)
    expect(catalogAmounts('business_base', 'month').listCents).toBe(2900)
  })

  it('a flat item (no beta anchor) resolves two keys that mean the same money, so a grant cannot mis-price it', () => {
    expect(loadoutChargePriceKey('nonprofit_seat', 'month', armFor(true))).toBe('nonprofit_seat_month')
    expect(loadoutChargePriceKey('nonprofit_seat', 'month', armFor(false))).toBe('nonprofit_seat_month_list')
    const flat = catalogAmounts('nonprofit_seat', 'month')
    expect(flat.foundingCents).toBe(flat.listCents)
  })
})

// ── THE GRANT IS PRIVATE — the public surfaces must not move ──────────────────────────────────────
// The explicit owner requirement: "I don't want to advertise that Beta pricing as a package on the
// website. I just want regular pricing." A later change that "helpfully" surfaces the grant on
// /pricing breaks the requirement, so the assertion measures the CONSEQUENCE: the granted amount must
// not appear anywhere a visitor reads.

/** Everything a visitor (or an answer engine) is shown: the offering cards (prices, anchors, beta
 *  notes, the JSON-LD Offer amounts), the plan price rows, every rendered comparison cell, the
 *  `/pricing` tier table, the persona loadout strip, and the `/llms.txt` ladder summary. Built exactly
 *  as those surfaces build it.
 *
 *  The tier table and the strip are in here on purpose: they read `effectiveCatalogAmounts` rather
 *  than the display twin, so a leak through the catalog half would otherwise be invisible to this
 *  file. `priceStrings()` is deliberately NOT here — it exposes the raw catalog founding amounts by
 *  design, as interpolation inputs, and is not itself a rendered surface. */
function publicSurface(betaActive: boolean): unknown {
  const input: PricingGridInput = { values: PRICING_DEFAULTS, catalog, betaActive }
  return {
    offerings: spaceOfferings(input),
    rows: spacePlanRows(PRICING_DEFAULTS, betaActive),
    grid: spaceFeatureGrid(input),
    tiers: pricingTiers(betaActive, { values: PRICING_DEFAULTS, catalog }),
    strip: loadoutStrip(betaActive),
    ladder: pricingLadderSummary({ values: PRICING_DEFAULTS, catalog, betaActive }),
  }
}

function publicSurfaceJson(betaActive: boolean): string {
  return JSON.stringify(publicSurface(betaActive))
}

/** Every string a visitor can read, walked out of the whole surface above. */
function readableTexts(betaActive: boolean): string[] {
  const texts: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') texts.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(publicSurface(betaActive))
  return texts
}

/**
 * EVERY PRICE A VISITOR IS QUOTED FOR A SPACE PLAN, across the three surfaces that quote one: the
 * `/pricing` offering cards (and their JSON-LD Offer amounts), the plan price rows, and the tier
 * table's rendered headline + struck anchor at both intervals.
 *
 * 🔴 WHY A SCOPED COLLECTOR AND NOT A SWEEP OF THE WHOLE BLOB. A blanket "does 4900 appear anywhere"
 * fires on prices that have nothing to do with the beta rate: Independent's $249 is `24900` cents, and
 * a Business-plus-Vera persona loadout legitimately totals `$49/mo` ($29 + $20) once the window is
 * shut. Both were live false positives on the first draft of this test. A gate that cries wolf gets
 * loosened, so this collects the fields that actually quote a Space plan and pins them EXACTLY.
 */
function spacePlanQuotes(betaActive: boolean): { labels: string[]; cents: number[] } {
  const input: PricingGridInput = { values: PRICING_DEFAULTS, catalog, betaActive }
  const labels: string[] = []
  const cents: number[] = []
  for (const o of spaceOfferings(input)) {
    labels.push(o.monthly)
    if (o.yearly) labels.push(o.yearly)
    if (o.listAnchor) labels.push(o.listAnchor)
    cents.push(o.monthlyCents)
  }
  for (const r of spacePlanRows(PRICING_DEFAULTS, betaActive)) {
    labels.push(r.monthly)
    if (r.annual) labels.push(r.annual)
    if (r.list) labels.push(r.list)
    cents.push(r.monthlyCents)
    if (r.annualCents != null) cents.push(r.annualCents)
    if (r.listCents != null) cents.push(r.listCents)
  }
  for (const t of pricingTiers(betaActive, { values: PRICING_DEFAULTS, catalog })) {
    for (const interval of ['month', 'year'] as const) {
      labels.push(tierHeadline(t, interval))
      const anchor = tierListAnchor(t, interval)
      if (anchor) labels.push(anchor)
    }
  }
  return {
    labels: [...new Set(labels)].sort(),
    cents: [...new Set(cents)].sort((a, b) => a - b),
  }
}

describe('the public grid is IDENTICAL with and without a granted Space', () => {
  it('no public pricing function can even be told about a grant', () => {
    // Structural, and the reason the surface cannot move: the display layer's beta inputs are a single
    // boolean about the WINDOW. There is no per-Space parameter to thread a grant through, so surfacing
    // one would require changing these signatures — which is what this assertion makes visible.
    expect(effectiveCatalogAmounts.length).toBe(2) // (amounts, betaActive)
    expect(effectiveTierPrice.length).toBe(2) // (price, betaActive)
    expect(spacePlanRows.length).toBe(2) // (values, betaActive)
  })

  it('a granted Space is charged $49 while the page still prints $79, in the same run', () => {
    // The two halves side by side, so neither can be true on its own.
    expect(loadoutChargeArm({ lockedPriceId: null, betaActive: WINDOW_SHUT, spaceHasBetaGrant: true })).toBe(
      'founding',
    )
    const byId = Object.fromEntries(
      spaceOfferings({ values: PRICING_DEFAULTS, catalog, betaActive: WINDOW_SHUT }).map((o) => [o.id, o]),
    )
    expect(byId.collective!.monthly).toBe('$79/mo')
    expect(byId.collective!.monthlyCents).toBe(7900)
    expect(byId.collective!.listAnchor).toBeNull()
    expect(byId.collective!.betaNote).toBeNull()
    expect(byId.business!.monthly).toBe('$29/mo')
    expect(byId.business!.betaNote).toBeNull()
  })

  it('every Space-plan price a visitor is quoted is the LIST price, exactly and only', () => {
    const { labels, cents } = spacePlanQuotes(WINDOW_SHUT)
    // The whole public quote, pinned. A beta amount reaching any of these three surfaces adds a member
    // to one of these sets, and an exact match is the only assertion a "helpful" partial leak cannot
    // slip past.
    expect(labels).toEqual([
      '$2,490', // Independent, yearly (the row form carries no suffix, the card form does)
      '$2,490/yr',
      '$249',
      '$249/mo',
      '$29', // Business — the list price, and the ONLY Business number a visitor sees
      '$29/mo',
      '$290',
      '$290/yr',
      '$39', // Non Profit, flat, never had a beta rate
      '$39/mo',
      '$390',
      '$390/yr',
      '$79', // Collective — the list price, and the ONLY Collective number a visitor sees
      '$79/mo',
      '$790',
      '$790/yr',
      'Free',
    ])
    expect(cents).toEqual([0, 2900, 3900, 7900, 24900, 29000, 39000, 79000, 249000])
    // The founding amounts a GRANTED Space is charged, absent from both sets.
    for (const amount of ['$19/mo', '$190/yr', '$49/mo', '$490/yr', '$19', '$49']) {
      expect(labels, `${amount} is quoted on a public surface`).not.toContain(amount)
    }
    for (const c of [1900, 19000, 4900, 49000]) {
      expect(cents, `${c} cents is quoted on a public surface`).not.toContain(c)
    }
  })

  it('the "Beta rate" caption appears nowhere at all, on any of the swept surfaces', () => {
    // No collision risk on this one, so it is swept across the WHOLE surface rather than scoped.
    expect(readableTexts(WINDOW_SHUT).filter((t) => t.includes('Beta rate'))).toEqual([])
  })

  it('NON-VACUITY: those leak tests really can fail — with the WINDOW open the same surfaces show $49', () => {
    // If the beta amounts were unreachable from these surfaces for some unrelated reason, the
    // assertions above would pass by accident forever. Opening the window puts them right back on the
    // page, which proves the surfaces are genuinely capable of printing them and that the
    // closed-window run above is a real measurement of a real risk.
    const { labels, cents } = spacePlanQuotes(true)
    expect(labels).toContain('$49/mo')
    expect(labels).toContain('$490/yr')
    expect(cents).toContain(4900)
    expect(readableTexts(true).some((t) => t.includes('Beta rate'))).toBe(true)
  })

  it('the surface is byte-identical across a granted and an ungranted world', () => {
    // The grant lives on a Space row; the grid is a pure function of (operator values, catalog, window).
    // Rendering it either side of a grant decision must produce the same bytes.
    const before = publicSurfaceJson(WINDOW_SHUT)
    expect(loadoutChargeArm({ lockedPriceId: null, betaActive: WINDOW_SHUT, spaceHasBetaGrant: true })).toBe(
      'founding',
    )
    const after = publicSurfaceJson(WINDOW_SHUT)
    expect(after).toBe(before)
  })

  it('the live surface is the closed-window surface, so this is not a hypothetical', () => {
    // Guards the whole file against becoming decorative if someone re-opens BETA_PRICING_ENDS_AT
    // without reading this: the grant exists BECAUSE the window is shut.
    expect(isBetaPricingActive()).toBe(false)
    expect(publicSurfaceJson(isBetaPricingActive())).toBe(publicSurfaceJson(WINDOW_SHUT))
  })
})

describe('the lock supersedes the grant, which is why the grant needs no expiry', () => {
  it('once a granted Space subscribes, its lock is what re-bills — the grant is never consulted again', () => {
    // The reconciler records the charged price id as the lock. From then on arm 1 wins.
    const lockedFromTheGrantedCheckout = 'price_collective_base_month_founding'
    expect(
      loadoutChargeArm({
        lockedPriceId: lockedFromTheGrantedCheckout,
        betaActive: WINDOW_SHUT,
        spaceHasBetaGrant: true,
      }),
    ).toBe('lock')
    // And revoking the grant afterwards cannot raise their rate.
    expect(
      loadoutChargeArm({
        lockedPriceId: lockedFromTheGrantedCheckout,
        betaActive: WINDOW_SHUT,
        spaceHasBetaGrant: false,
      }),
    ).toBe('lock')
  })

  it('a lock recorded at the LIST price is re-billed too — the lock is a record, not a judgement', () => {
    // The gap this whole feature closes: without the grant, a person promised $49 checks out at $79
    // and their lock faithfully records $79 forever. The grant fixes the FIRST charge; nothing fixes a
    // lock after the fact except a new subscription.
    expect(
      loadoutChargeArm({
        lockedPriceId: 'price_collective_base_month_list',
        betaActive: WINDOW_SHUT,
        spaceHasBetaGrant: true,
      }),
    ).toBe('lock')
  })
})
