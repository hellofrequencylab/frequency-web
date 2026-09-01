import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { NETWORK_TAKE_RATE_DEFAULT, catalogItem } from '@/lib/billing/pricing-keys'
import { PRICING_DEFAULTS } from '@/lib/pricing/defaults'
import { PLACEHOLDER_MEMBER_PRICE_CENTS } from '@/lib/pricing/feature-tiers'
import { catalogConfigByKey, defaultCatalogConfig } from '@/lib/pricing/catalog-config'
import { allOfferings, spaceOfferings, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { pricingLadderSummary, pricingTiers } from '@/lib/pricing/pricing-page'
import { SPACE_PLANS } from '@/lib/pricing/plans'

// PHASE 5 GATE 2 — THE SINGLE-SOURCE ASSERTION (docs/VALUE-LADDER.md §6, ADR-916).
//
// The defect this file exists to prevent: nine structures enumerated what a tier gets, and six of them
// could disagree. They disagreed by the ordinary mechanism, which is that a number was TYPED somewhere
// instead of READ. Business quoted $19 on /pricing and $29 on every in-app ladder. Three different
// modules answered "what is the take-rate", so an operator editing it at /admin/pricing moved exactly
// one of them. /llms.txt published a fee ladder the product had already retired.
//
// Two halves, and both are needed. The first is NEGATIVE: no marketing surface may contain a literal
// price or rate at all, so the drift cannot be reintroduced by hand. The second is POSITIVE: the
// surfaces that state a figure all move together when the one config moves, so "no literals" cannot be
// satisfied by pointing at a second copy of the numbers.

// ── The surfaces under the rule ──────────────────────────────────────────────────────────────────────

/** Every forward-facing marketing surface: the home page, the whole /(marketing) tree, the two
 *  answer-engine routes, and the marketing copy config + components those routes render from. A figure
 *  in any of these is a figure a visitor or an answer engine can read. */
const MARKETING_ROOTS = [
  'app/page.tsx',
  'app/(marketing)',
  'app/llms.txt',
  'app/llms-full.txt',
  'lib/marketing',
  'components/marketing',
]

// The ONE statSync is on the caller's own `path` — a ROOTS entry, which may be a file
// (app/llms.txt) or a directory. Below it every type comes from the dirent that produced the
// name, so no path is resolved twice (ADR-1185).
function sourceFiles(path: string, out: string[] = []): string[] {
  const keep = (p: string) => {
    if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  if (statSync(path).isFile()) {
    keep(path)
    return out
  }
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else keep(p)
    }
  }
  walk(path)
  return out
}

/** Strip comments. A comment naming a number is documentation ("this used to say 10%"), not something a
 *  visitor reads, and banning it would push the explanation out of the code that needs it most. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

/** A percentage inside one of these CSS constructs is a colour stop or a scroll margin, not a rate. The
 *  list names the exact functions rather than guessing from the words on the line, so it cannot quietly
 *  grow into an excuse. Today it covers two real cases: the marketing gradients and one rootMargin. */
const CSS_CONTEXT = /(linear-gradient\(|radial-gradient\(|color-mix\(|rootMargin)/

/** 0% and 100% are not tier rates. They are the two halves of the promise ("you keep 100% of your own
 *  bookings", "0% on the people already yours"), they are identical on every tier, and they are true
 *  whatever the operator sets, so they are structural copy rather than a figure that can go stale. */
const PROMISE_PERCENTS = new Set(['0', '100'])

describe('no marketing surface states a tier price or a rate as a literal', () => {
  const files = MARKETING_ROOTS.flatMap((root) => sourceFiles(root))

  it('finds the marketing surfaces (the scan is not vacuously empty)', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(files).toContain('app/page.tsx')
    expect(files.some((f) => f.includes('pricing'))).toBe(true)
    expect(files.some((f) => f.startsWith('app/llms'))).toBe(true)
  })

  it('contains no hardcoded dollar figure', () => {
    const offenders: string[] = []
    for (const file of files) {
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          // `$` followed by a digit is a money literal in every register this repo writes in ("$19",
          // "$0", "$2,490"). Template interpolation is `${`, which never matches.
          if (/\$\d/.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
        })
    }
    expect(
      offenders,
      `A price belongs in the catalog (lib/billing/pricing-keys.ts), read through priceStrings / the pricing grid.\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('contains no hardcoded percentage for a tier or a rate', () => {
    const offenders: string[] = []
    for (const file of files) {
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (CSS_CONTEXT.test(line)) return
          for (const match of line.matchAll(/\b\d[\d,.]*%/g)) {
            const value = match[0].slice(0, -1).replace(/,/g, '')
            if (PROMISE_PERCENTS.has(value)) continue
            offenders.push(`${file}:${i + 1}  ${match[0]}  ${line.trim()}`)
          }
        })
    }
    expect(
      offenders,
      `A rate belongs in NETWORK_TAKE_RATE_DEFAULT, read through the pricing grid and formatted with formatBps.\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

// ── The positive half: the surfaces move together, because they read ONE input ───────────────────────

const catalog = catalogConfigByKey(defaultCatalogConfig())
const input = (values = PRICING_DEFAULTS): PricingGridInput => ({ values, catalog, betaActive: true })

describe('one source: the code defaults are READ from the catalog and the rate vector', () => {
  it('every Space price default is the catalog amount the checkout bills', () => {
    const item = { business: 'business_base', collective: 'collective_base', nonprofit: 'nonprofit_seat', independent: 'independent_base' } as const
    for (const [plan, key] of Object.entries(item)) {
      const { month, year } = catalogItem(key)
      const price = PRICING_DEFAULTS.plan[plan as keyof typeof item]
      expect(price.monthly_cents, plan).toBe(month.foundingCents)
      expect(price.annual_cents, plan).toBe(year.foundingCents)
      // The crossed-out anchor exists exactly where the catalog carries one, never by hand.
      expect(price.list_cents ?? null, plan).toBe(month.listCents > month.foundingCents ? month.listCents : null)
    }
  })

  it('every take-rate default is the vector the fee math itself falls back to', () => {
    const t = PRICING_DEFAULTS.take_rate
    expect(t.member_free_bps).toBe(NETWORK_TAKE_RATE_DEFAULT.memberFree)
    expect(t.member_bps).toBe(NETWORK_TAKE_RATE_DEFAULT.member)
    for (const plan of SPACE_PLANS) {
      expect(t.network_bps[plan], plan).toBe(NETWORK_TAKE_RATE_DEFAULT[plan])
    }
  })

  it('the Crew price default is the one member-price map, not a second copy', () => {
    expect(PRICING_DEFAULTS.tier.crew.monthly_cents).toBe(PLACEHOLDER_MEMBER_PRICE_CENTS.crew)
  })
})

describe('one source: every published ladder moves when the config moves', () => {
  /** The config with ONE rate changed. If a surface still quotes the old number, it is reading a
   *  different source, which is the whole defect. 777 bps is deliberately unlike any real rung. */
  const edited = {
    ...PRICING_DEFAULTS,
    take_rate: {
      ...PRICING_DEFAULTS.take_rate,
      network_bps: { ...PRICING_DEFAULTS.take_rate.network_bps, business: 777 },
    },
  }

  it('an operator rate edit moves the pricing grid, the tier table, and the answer-engine ladder together', () => {
    const business = spaceOfferings(input(edited)).find((o) => o.id === 'business')!
    expect(business.networkRateBps).toBe(777)
    expect(business.takeRate).toContain('7.77%')

    const tier = pricingTiers(true, { values: edited, catalog }).find((t) => t.id === 'business')!
    expect(tier.takeRate).toBe(business.takeRate)

    const ladder = pricingLadderSummary({ values: edited, catalog, betaActive: true }).join('\n')
    expect(ladder).toContain('7.77%')
    // And the number it replaced is gone from the published corpus entirely.
    expect(ladder).not.toContain('5% on network-sourced sales')
  })

  it('every rung the grid publishes carries its rate as a number, not only as prose', () => {
    for (const offering of allOfferings(input())) {
      expect(typeof offering.networkRateBps, offering.id).toBe('number')
      // The sentence and the number are two views of one value, so no caller has to parse the prose.
      expect(offering.takeRate, offering.id).toContain(
        offering.networkRateBps === 0 ? '0%' : `${offering.networkRateBps / 100}%`,
      )
    }
  })
})
