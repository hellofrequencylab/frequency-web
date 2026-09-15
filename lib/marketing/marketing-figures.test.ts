import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  NETWORK_TAKE_RATE_DEFAULT,
  catalogItem,
  networkTakeRateBpsForPlan,
  networkTakeRateFromStored,
} from '@/lib/billing/pricing-keys'
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
 *  answer-engine routes, the persona doors, the personal upgrade page, the marketing copy config +
 *  components those routes render from, the CMS templates the editor seeds a marketing page from, the
 *  pricing copy spine those templates and routes interpolate, the JSON-LD builders, and the Vera
 *  primer. A figure in any of these is a figure a visitor or an answer engine can read.
 *
 *  🔴 THE CATALOG ITSELF IS NOT HERE, ON PURPOSE. lib/billing/pricing-keys.ts, lib/pricing/defaults.ts,
 *  lib/pricing/catalog-config.ts and lib/pricing/feature-tiers.ts are where the amounts LIVE (in
 *  cents, never as `$` strings); the rule is that every surface reads them from there. */
const MARKETING_ROOTS = [
  'app/page.tsx',
  'app/(marketing)',
  'app/(main)/upgrade',
  'app/for',
  'app/llms.txt',
  'app/llms-full.txt',
  'lib/marketing',
  'lib/page-editor/templates',
  'lib/pricing/pricing-page.ts',
  'lib/pricing/pricing-grid.ts',
  'lib/pricing/display.ts',
  'lib/jsonld.ts',
  'lib/ai/voice.ts',
  'components/marketing',
]

/** The help center. Markdown, not source, so it gets its own walk: no comments to strip, and no
 *  template interpolation exists there at all, which is exactly why a figure in it can only ever be
 *  typed. An article that needs a number points at /pricing, which reads the catalog. */
const HELP_ROOTS = ['content/help']

// The ONE statSync is on the caller's own `path` — a ROOTS entry, which may be a file
// (app/llms.txt) or a directory. Below it every type comes from the dirent that produced the
// name, so no path is resolved twice (ADR-1185).
function sourceFiles(path: string, out: string[] = [], ext: RegExp = /\.tsx?$/): string[] {
  const keep = (p: string) => {
    if (ext.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
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
 *  whatever the operator sets, so they are structural copy rather than a figure that can go stale.
 *  This is the WHOLE allow-list. It names no price, no rate, and no tier, and it does not grow: a
 *  figure that is not a price (a year, a count, a day of the month) never matches the two patterns
 *  below in the first place, so it needs no waiver. */
const PROMISE_PERCENTS = new Set(['0', '100'])

/** Every line of `text` that carries a money literal: `$` followed by a digit, which is a price in
 *  every register this repo writes in ("$19", "$0", "$2,490"). Template interpolation is `${`, which
 *  never matches. Returned as "line:column-free excerpt" so a failure names the exact line. PURE. */
export function dollarOffenders(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  text.split('\n').forEach((line, i) => {
    if (/\$\d/.test(line)) out.push({ line: i + 1, text: line.trim() })
  })
  return out
}

/** Every percentage literal in `text` that is not one of the two promise halves and not a CSS stop.
 *  PURE. */
export function percentOffenders(text: string): { line: number; match: string; text: string }[] {
  const out: { line: number; match: string; text: string }[] = []
  text.split('\n').forEach((line, i) => {
    if (CSS_CONTEXT.test(line)) return
    for (const match of line.matchAll(/\b\d[\d,.]*%/g)) {
      const value = match[0].slice(0, -1).replace(/,/g, '')
      if (PROMISE_PERCENTS.has(value)) continue
      out.push({ line: i + 1, match: match[0], text: line.trim() })
    }
  })
  return out
}

describe('no marketing surface states a tier price or a rate as a literal', () => {
  const files = MARKETING_ROOTS.flatMap((root) => sourceFiles(root))

  it('finds the marketing surfaces (the scan is not vacuously empty)', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(files).toContain('app/page.tsx')
    expect(files).toContain('app/(marketing)/pricing/page.tsx')
    expect(files).toContain('lib/page-editor/templates/pricing.ts')
    expect(files).toContain('lib/pricing/pricing-page.ts')
    expect(files).toContain('lib/ai/voice.ts')
    expect(files.some((f) => f.startsWith('app/llms'))).toBe(true)
    expect(files.some((f) => f.startsWith('app/for/'))).toBe(true)
    expect(files.some((f) => f.startsWith('app/(main)/upgrade/'))).toBe(true)
  })

  it('contains no hardcoded dollar figure', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const o of dollarOffenders(stripComments(readFileSync(file, 'utf8')))) {
        offenders.push(`${file}:${o.line}  ${o.text}`)
      }
    }
    expect(
      offenders,
      `A price belongs in the catalog (lib/billing/pricing-keys.ts), read through priceStrings / the pricing grid.\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('contains no hardcoded percentage for a tier or a rate', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const o of percentOffenders(stripComments(readFileSync(file, 'utf8')))) {
        offenders.push(`${file}:${o.line}  ${o.match}  ${o.text}`)
      }
    }
    expect(
      offenders,
      `A rate belongs in NETWORK_TAKE_RATE_DEFAULT, read through the pricing grid and formatted with formatBps.\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('no help article states a price or a rate as a literal', () => {
  const articles = HELP_ROOTS.flatMap((root) => sourceFiles(root, [], /\.mdx?$/))

  it('finds the help center (the scan is not vacuously empty)', () => {
    expect(articles.length).toBeGreaterThan(50)
    expect(articles).toContain('content/help/spaces/plans-and-pricing.md')
  })

  it('contains no dollar figure and no rate (an article that needs a number links to /pricing)', () => {
    const offenders: string[] = []
    for (const file of articles) {
      const text = readFileSync(file, 'utf8')
      for (const o of dollarOffenders(text)) offenders.push(`${file}:${o.line}  ${o.text}`)
      for (const o of percentOffenders(text)) offenders.push(`${file}:${o.line}  ${o.match}  ${o.text}`)
    }
    expect(
      offenders,
      `The help center has no template interpolation, so a figure in it can only be typed and can only go stale. Link to /pricing, which reads the catalog.\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

// ── The guard can actually fire: a planted literal is caught, and the allow-list is exactly two ─────

describe('mutation check: the scanner catches a planted figure', () => {
  it('reports a planted "$29" and a planted "5%" by line', () => {
    const planted = [
      "const kicker = 'Business is $29 a month.'",
      'const note = `Yearly is ${yearly}, two months free.`',
      "const rate = 'and 5% on network-sourced sales'",
    ].join('\n')
    expect(dollarOffenders(planted).map((o) => o.line)).toEqual([1])
    expect(percentOffenders(planted).map((o) => `${o.line}:${o.match}`)).toEqual(['3:5%'])
  })

  it('reports a planted figure inside markdown prose and a table cell', () => {
    const planted = ['| **Business** | $29 | $290 |', 'Crew brings that to 8%.', 'from $4.99 a month'].join('\n')
    expect(dollarOffenders(planted).map((o) => o.line)).toEqual([1, 3])
    expect(percentOffenders(planted).map((o) => o.match)).toEqual(['8%'])
  })

  it('lets the two promise halves, template interpolation, CSS stops, and non-price numbers through', () => {
    const clean = [
      'You keep 100% of your own bookings, 0% on the people already yours.',
      'const price = `${o.monthly}/mo`',
      "background: 'linear-gradient(90deg, var(--a) 40%, var(--b) 60%)'",
      'Founded in 2020, 14 day trial, 501(c)(3), October 1, 2026.',
    ].join('\n')
    expect(dollarOffenders(clean)).toEqual([])
    expect(percentOffenders(clean)).toEqual([])
  })

  it('the allow-list is the two promise halves and nothing else', () => {
    expect([...PROMISE_PERCENTS].sort()).toEqual(['0', '100'])
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
    // Every plan, placed on its rung through the one resolver, reads the same number from the settings
    // default as from the code vector (LIVE-230: the vector is keyed by rung, never by plan name).
    for (const plan of SPACE_PLANS) {
      expect(networkTakeRateBpsForPlan(plan, networkTakeRateFromStored(t)), plan).toBe(networkTakeRateBpsForPlan(plan))
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
      network_bps: { ...PRICING_DEFAULTS.take_rate.network_bps, paid: 777 },
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
    expect(ladder).not.toContain('3% on network-sourced sales')
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
