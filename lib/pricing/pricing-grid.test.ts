import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Does this href resolve to a real App Router page?
 *
 *  Walks app/ for a matching page.tsx, allowing for route groups -- `(marketing)` and friends
 *  are directories that contribute NOTHING to the URL, so `/pricing` may live at
 *  `app/(marketing)/pricing/page.tsx`. Dynamic segments (`[slug]`) match any one segment.
 *  Anchors and query strings are stripped before matching. */
function routeExists(href: string): boolean {
  const path = href.split('#')[0].split('?')[0].replace(/\/$/, '')
  const segments = path.split('/').filter(Boolean)
  const roots = ['app']
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) return existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'route.ts'))
    const [head, ...tail] = rest
    // Exact segment, then any dynamic segment, then transparently through route groups.
    if (existsSync(join(dir, head)) && walk(join(dir, head), tail)) return true
    let entries: string[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      return false
    }
    for (const name of entries) {
      if (name.startsWith('(') && walk(join(dir, name), rest)) return true
      if (name.startsWith('[') && walk(join(dir, name), tail)) return true
    }
    return false
  }
  return roots.some((r) => walk(join(process.cwd(), r), segments))
}

// THE PRICING GRID (lib/pricing/pricing-grid.ts) — the guard that the public /pricing page can never
// drift from what the plans actually grant. The point of these tests is NOT to restate the grid's
// contents (that would just re-type the drift we are preventing); it is to prove the DERIVATION:
//
//   * change a tier depth key set, and the grid's cells change with it;
//   * every sellable tier (SPACE_PLANS + both member tiers) has a column;
//   * a crossed-out anchor appears exactly where the config carries one and nowhere else;
//   * the take-rate row is the real network rate the fee code charges;
//   * the page source contains no hard-coded dollar figure at all.

import { catalogConfigByKey, defaultCatalogConfig } from './catalog-config'
import { formatCents } from './display'
import { FEATURE_GATES, meetsGate } from './gates'
import {
  ADDON_ENTITLEMENT_KEYS,
  BUSINESS_DEPTH_ENTITLEMENT_KEYS,
  COLLECTIVE_DEPTH_ENTITLEMENT_KEYS,
  INDEPENDENT_DEPTH_ENTITLEMENT_KEYS,
  SPACE_PLANS,
  SPACE_PLAN_LABEL,
  planEntitlementKeys,
  type SpacePlan,
} from './plans'
import { PRICING_DEFAULTS } from './settings'
import {
  BETA_RATE_NOTE,
  allOfferings,
  memberFeatureGrid,
  memberOfferings,
  planExtras,
  spaceFeatureGrid,
  spaceOfferings,
  type FeatureGrid,
  type PricingGridInput,
} from './pricing-grid'

const input: PricingGridInput = {
  values: PRICING_DEFAULTS,
  catalog: catalogConfigByKey(defaultCatalogConfig()),
}

/** Find one row anywhere in a grid by its key. */
function row(grid: FeatureGrid, key: string) {
  const found = grid.groups.flatMap((g) => g.rows).find((r) => r.key === key)
  expect(found, `row ${key} should exist`).toBeTruthy()
  return found!
}

/** The cell text for a row, keyed by column id. */
function cellsByColumn(grid: FeatureGrid, key: string): Record<string, string> {
  const r = row(grid, key)
  return Object.fromEntries(grid.columns.map((c, i) => [c.id, r.cells[i]!.text]))
}

// ── Every offering is present, priced, and detailed ─────────────────────────────────────────────────

describe('offerings: every sellable tier is on the page', () => {
  it('covers both member tiers and every SPACE_PLANS tier, in ladder order', () => {
    expect(memberOfferings(input).map((o) => o.id)).toEqual(['member', 'crew'])
    // The Space columns ARE the plan ladder: adding a tier to SPACE_PLANS adds a column here.
    expect(spaceOfferings(input).map((o) => o.tier)).toEqual([...SPACE_PLANS])
    expect(allOfferings(input)).toHaveLength(2 + SPACE_PLANS.length)
  })

  it('labels every Space column from the naming canon', () => {
    for (const o of spaceOfferings(input)) {
      expect(o.label).toBe(SPACE_PLAN_LABEL[o.tier as SpacePlan])
    }
  })

  it('gives every offering a price, a who-it-is-for line, and a CTA', () => {
    for (const o of allOfferings(input)) {
      expect(o.monthly.length).toBeGreaterThan(0)
      expect(o.forWho.length).toBeGreaterThan(0)
      expect(o.tagline.length).toBeGreaterThan(0)
      expect(o.cta.href.startsWith('/')).toBe(true)
      // startsWith('/') was the whole check, and it passed for '/join' -- a route that does
      // not exist (app/join/ holds only [token]/), so the free plan's CTA 404'd on the public
      // pricing page. Resolve against the real app/ tree instead of trusting the shape.
      expect(routeExists(o.cta.href), `${o.id} CTA points at a non-existent route: ${o.cta.href}`).toBe(true)
      // Voice: no em dashes anywhere in the offering copy (CONTENT-VOICE hard rule).
      expect(`${o.tagline} ${o.forWho} ${o.billing} ${o.takeRate}`).not.toContain('—')
    }
  })

  it('prices every offering from the config, never from a literal', () => {
    const [, crew] = memberOfferings(input)
    // Crew is pay-what-you-want: the configured amount is the FLOOR, so the label reads "from".
    expect(crew!.monthly).toBe(`from ${formatCents(PRICING_DEFAULTS.tier.crew.monthly_cents)}/mo`)
    for (const o of spaceOfferings(input)) {
      if (o.tier === 'free') {
        expect(o.monthly).toBe('Free')
        continue
      }
      const price = PRICING_DEFAULTS.plan[o.tier as Exclude<SpacePlan, 'free'>]
      expect(o.monthly).toBe(`${formatCents(price.monthly_cents)}/mo`)
      expect(o.yearly).toBe(`${formatCents(price.annual_cents!)}/yr`)
    }
  })

  it('crowns exactly Crew and Collective (the adopted DAWN 2 reference; no ADR overrides it)', () => {
    // One featured column per ladder: Crew on the member band, Collective on the Space band, the
    // "Best choice" pair in design_handoff/dawn/ui_kits/marketing/pricing.html. The page float, the
    // comparison emphasis, and the default-open mobile column all read THIS flag, so this is the one
    // place the crown is decided.
    expect(memberOfferings(input).filter((o) => o.featured).map((o) => o.id)).toEqual(['crew'])
    expect(spaceOfferings(input).filter((o) => o.featured).map((o) => o.id)).toEqual(['collective'])
  })

  it('applies the operator-set trial to the paid Space plans only', () => {
    for (const o of spaceOfferings(input)) {
      if (o.tier === 'free') expect(o.trial).toBeNull()
      else expect(o.trial).toBe(`${PRICING_DEFAULTS.trial.days}-day free trial.`)
    }
    // Members get no trial: the free tier is the trial.
    for (const o of memberOfferings(input)) expect(o.trial).toBeNull()
  })

  it('yearly is the operator-set two-months-free deal, computed from the config', () => {
    const monthsFree = PRICING_DEFAULTS.annual_discount.months_free
    for (const plan of ['business', 'collective', 'nonprofit', 'independent'] as const) {
      const p = PRICING_DEFAULTS.plan[plan]
      expect(p.annual_cents).toBe(p.monthly_cents * (12 - monthsFree))
    }
  })
})

// ── The beta anchors, shown honestly and only where the config carries one ──────────────────────────

describe('beta pricing: the crossed-out anchor idiom (ADR-463)', () => {
  it('shows Business and Collective at their beta rate under a struck list price', () => {
    const byId = Object.fromEntries(spaceOfferings(input).map((o) => [o.id, o]))
    expect(byId.business!.monthly).toBe(`${formatCents(1900)}/mo`)
    expect(byId.business!.listAnchor).toBe(formatCents(2900))
    expect(byId.collective!.monthly).toBe(`${formatCents(4900)}/mo`)
    expect(byId.collective!.listAnchor).toBe(formatCents(7900))
  })

  it('states the beta lock exactly where an anchor is, and nowhere else', () => {
    for (const o of allOfferings(input)) {
      expect(o.betaNote).toBe(o.listAnchor ? BETA_RATE_NOTE : null)
    }
    // The lock is the grandfather promise, not a countdown or a scarcity line.
    expect(BETA_RATE_NOTE).toMatch(/as long as you keep the plan/)
  })

  it('invents no beta rate for Non Profit or Independent (single price, no strike)', () => {
    const byId = Object.fromEntries(spaceOfferings(input).map((o) => [o.id, o]))
    for (const id of ['free', 'nonprofit', 'independent']) {
      expect(byId[id]!.listAnchor).toBeNull()
      expect(byId[id]!.betaNote).toBeNull()
    }
  })

  it('drops the anchor when the config no longer carries one (derived, not hard-coded)', () => {
    const flat = {
      ...input,
      values: {
        ...PRICING_DEFAULTS,
        plan: { ...PRICING_DEFAULTS.plan, business: { monthly_cents: 2900, annual_cents: 29000 } },
      },
    }
    const business = spaceOfferings(flat).find((o) => o.id === 'business')!
    expect(business.listAnchor).toBeNull()
    expect(business.betaNote).toBeNull()
    expect(business.monthly).toBe(`${formatCents(2900)}/mo`)
  })
})

// ── The grid derives from the entitlement key sets ──────────────────────────────────────────────────

describe('feature grid: cells derive from the tier depth key sets', () => {
  const grid = spaceFeatureGrid(input)

  it('has one column per Space tier and at least one row per group', () => {
    expect(grid.columns.map((c) => c.tier)).toEqual([...SPACE_PLANS])
    expect(grid.groups.length).toBeGreaterThanOrEqual(8)
    for (const g of grid.groups) expect(g.rows.length).toBeGreaterThan(0)
  })

  it('gives every row exactly one cell per column', () => {
    for (const g of grid.groups) {
      for (const r of g.rows) expect(r.cells).toHaveLength(grid.columns.length)
    }
  })

  it('an entitlement row is included exactly where the depth key set grants it', () => {
    // Spot the three depth sets through three rows that separate them.
    expect(cellsByColumn(grid, 'crm')).toEqual({
      free: 'Not included',
      business: 'Included',
      collective: 'Included',
      nonprofit: 'Included',
      independent: 'Included',
    })
    expect(cellsByColumn(grid, 'team')).toEqual({
      free: 'Not included',
      business: 'Not included',
      collective: 'Included',
      nonprofit: 'Included',
      independent: 'Included',
    })
    expect(cellsByColumn(grid, 'whitelabel')).toEqual({
      free: 'Not included',
      business: 'Not included',
      collective: 'Not included',
      nonprofit: 'Not included',
      independent: 'Included',
    })
  })

  it('EVERY entitlement-backed row agrees with planEntitlementKeys, key by key', () => {
    // The whole point: no cell is typed by hand, so each one must equal the key-set answer.
    const entitlementRows: [string, string][] = [
      ['crm', 'crm'],
      ['crm.playbooks', 'crm.playbooks'],
      ['email', 'email'],
      ['reporting', 'reporting'],
      ['space_full_website', 'space_full_website'],
      ['automation', 'automation'],
      ['multi_pipeline', 'multi_pipeline'],
      ['team', 'team'],
      ['program', 'program'],
      ['whitelabel', 'whitelabel'],
    ]
    for (const [rowKey, entitlementKey] of entitlementRows) {
      const cells = cellsByColumn(grid, rowKey)
      for (const plan of SPACE_PLANS) {
        const granted = planEntitlementKeys(plan).includes(entitlementKey)
        expect(cells[plan], `${rowKey} @ ${plan}`).toBe(granted ? 'Included' : 'Not included')
      }
    }
  })

  it('covers every key in the three depth sets with a row (no silent gap)', () => {
    const rowKeys = new Set(grid.groups.flatMap((g) => g.rows).map((r) => r.key))
    const depthKeys = new Set([
      ...BUSINESS_DEPTH_ENTITLEMENT_KEYS,
      ...COLLECTIVE_DEPTH_ENTITLEMENT_KEYS,
      ...INDEPENDENT_DEPTH_ENTITLEMENT_KEYS,
    ])
    const missing = [...depthKeys].filter((k) => !rowKeys.has(k))
    expect(missing, 'every depth key needs a grid row').toEqual([])
  })

  it('a gate row agrees with the real FEATURE_GATES minimum', () => {
    for (const feature of ['space_storefront', 'space_collaborators', 'space_membership_tickets']) {
      const cells = cellsByColumn(grid, feature)
      for (const plan of SPACE_PLANS) {
        const allowed = meetsGate(FEATURE_GATES[feature]!, { plan })
        expect(cells[plan], `${feature} @ ${plan}`).toBe(allowed ? 'Included' : 'Not included')
      }
    }
  })

  it('the take-rate row IS take_rate.network_bps, tier by tier (never a typed ladder)', () => {
    // Pinning the numbers here is how the retired ladder ("Free Space 10%, Collective 3%") survived a
    // rate change: the test restated the very literals it was meant to guard. The row must equal what the
    // config carries, so an owner rate change moves the page and this test together (ADR-913).
    const net = PRICING_DEFAULTS.take_rate.network_bps
    const cells = cellsByColumn(grid, 'take_rate')
    for (const plan of SPACE_PLANS) {
      expect(cells[plan], `take_rate @ ${plan}`).toBe(`${net[plan] / 100}%`)
    }
  })

  it('holds the model invariants: the rate only falls as the tier rises, and 0% at the top', () => {
    const net = PRICING_DEFAULTS.take_rate.network_bps
    // Non Profit takes nothing, and Independent is off the network entirely.
    expect(net.nonprofit).toBe(0)
    expect(net.independent).toBe(0)
    // Across the PAID ladder the rate only ever falls, which is the claim the copy makes out loud
    // ("the rate drops as your plan rises").
    const paid = (['business', 'collective', 'nonprofit', 'independent'] as const).map((p) => net[p])
    expect(paid).toEqual([...paid].sort((a, b) => b - a))
    // Business is the rung the whole funnel steers to, so it is stated once, here.
    expect(net.business).toBe(500)
  })

  it('a meter row reads the tier rung on the usage ladder, not a typed number', () => {
    const contacts = cellsByColumn(grid, 'space_crm')
    expect(contacts.free).toBe('Up to 200 contacts')
    expect(contacts.business).toBe('Unlimited contacts')
    // A tier above the top rung reads the top rung, exactly as the enforcement seam resolves it.
    expect(contacts.independent).toBe('Unlimited contacts')
    const sends = cellsByColumn(grid, 'space_email')
    expect(sends.free).toBe('Up to 300 sends/mo')
    expect(sends.collective).toBe('Up to 25,000 sends/mo')
  })
})

// ── Seats + the AI add-on are integrated, priced from config ────────────────────────────────────────

describe('seats and the AI add-on', () => {
  const grid = spaceFeatureGrid(input)

  it('prices the AI add-on from the catalog on every paid tier, and never sells it on Free', () => {
    const cells = cellsByColumn(grid, 'addon_ai')
    const price = formatCents(input.catalog.addon_ai.month.foundingCents)
    expect(cells.free).toBe('Not sold on the free plan')
    for (const plan of ['business', 'collective', 'nonprofit', 'independent']) {
      expect(cells[plan]).toBe(`Add-on, ${price}/mo`)
    }
  })

  it('keeps the AI add-on keys out of every tier base (so no tier claims it as included)', () => {
    for (const plan of SPACE_PLANS) {
      const keys = planEntitlementKeys(plan)
      for (const k of ADDON_ENTITLEMENT_KEYS.ai) expect(keys).not.toContain(k)
    }
  })

  it('offers extra seats exactly on the tiers whose depth includes the team key', () => {
    const cells = cellsByColumn(grid, 'seats')
    for (const plan of SPACE_PLANS) {
      const hasTeam = planEntitlementKeys(plan).includes('team')
      expect(cells[plan] === 'Not on this plan', `seats @ ${plan}`).toBe(!hasTeam)
    }
  })

  it('does not publish a per-seat price while the seat item is a placeholder', () => {
    const seats = planExtras(input).find((e) => e.key === 'seats')!
    expect(seats.price).toBe('Owner-priced today')
    expect(seats.availability).toContain('Collective')
  })

  it('states both extras with a price line and a derived availability line', () => {
    const ai = planExtras(input).find((e) => e.key === 'ai')!
    expect(ai.price).toContain(formatCents(input.catalog.addon_ai.month.foundingCents))
    expect(ai.availability).toContain('Business')
    for (const e of planExtras(input)) expect(`${e.price} ${e.availability} ${e.detail}`).not.toContain('—')
  })
})

// ── The member grid ─────────────────────────────────────────────────────────────────────────────────

describe('member grid: Member and Crew on the personal ladder', () => {
  const grid = memberFeatureGrid(input)

  it('has the two member columns and derives its cells from the tier gates', () => {
    expect(grid.columns.map((c) => c.id)).toEqual(['member', 'crew'])
    for (const feature of ['gamification_full', 'vault_cash_in']) {
      const cells = cellsByColumn(grid, feature)
      expect(cells.member).toBe(meetsGate(FEATURE_GATES[feature]!, { tier: 'free' }) ? 'Included' : 'Not included')
      expect(cells.crew).toBe(meetsGate(FEATURE_GATES[feature]!, { tier: 'crew' }) ? 'Included' : 'Not included')
    }
  })

  it('says a free Space is open to anyone (Crew is not required to run one)', () => {
    expect(cellsByColumn(grid, 'space')).toEqual({ member: 'Included', crew: 'Included' })
  })

  it('quotes a rate on BOTH member columns, from config, with Crew lower (ADR-914)', () => {
    // 🔴 WHAT THIS TEST HAS NOW ASSERTED THREE WAYS, and why the history matters. It originally checked
    // member === crew, which printed the Crew rate under the free header. ADR-913 flipped it to assert
    // the free column says "Selling is not included". ADR-914 reversed the rule itself: selling is free
    // on every tier and the ladder IS the rate. So both columns must name a number, and the paid one
    // must be lower — that is the entire upgrade argument, rendered.
    const cells = cellsByColumn(grid, 'take_rate')
    expect(cells.crew).toBe(`${PRICING_DEFAULTS.take_rate.member_bps / 100}%`)
    expect(cells.member).toBe(`${PRICING_DEFAULTS.take_rate.member_free_bps / 100}%`)
    expect(cells.member).toMatch(/\d%/)
    expect(PRICING_DEFAULTS.take_rate.member_bps).toBeLessThan(PRICING_DEFAULTS.take_rate.member_free_bps)
  })

  it('does not gate selling at all: every member column can sell and take payments', () => {
    // The two gates that used to drive these cells (`event_paid_tickets`, `personal_payouts`) are
    // deleted. Asserted on the OUTPUT rather than on the gate map so the page's claim is what is
    // locked: a reader of /pricing must never be told a tier cannot sell.
    const cells = cellsByColumn(grid, 'sell_anything')
    expect(cells.member).toBe('Included')
    expect(cells.crew).toBe('Included')
  })

  it('🔴 no member column anywhere on the grid says selling is unavailable', () => {
    // A belt-and-braces sweep over EVERY row, because the old claim lived in three places and was
    // removed from three places. Any resurrection of a "selling is not included" cell fails here even if
    // it comes back under a new row key.
    for (const r of grid.groups.flatMap((g) => g.rows)) {
      for (const cell of r.cells) {
        expect(cell.text, `row ${r.key}`).not.toMatch(/selling is not included/i)
      }
    }
  })

  it('states the rate in both offering lines, and leads with the 0% promise on each', () => {
    const [member, crew] = memberOfferings(input)
    expect(member!.takeRate).toContain(`${PRICING_DEFAULTS.take_rate.member_free_bps / 100}%`)
    expect(crew!.takeRate).toContain(`${PRICING_DEFAULTS.take_rate.member_bps / 100}%`)
    // The promise is identical on every rung, so it must LEAD on every rung. If it read as a paid
    // feature the model would be misrepresented on the page that sells it.
    for (const o of memberOfferings(input)) expect(o.takeRate).toMatch(/^0% on your own people/)
  })
})

// ── Derivation, proven: move a key, the grid moves ──────────────────────────────────────────────────

describe('derivation guard: changing a depth key set changes the grid', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.doUnmock('./plans'))

  it('flips a cell when a key moves into a lower tier depth set', async () => {
    const actual = await vi.importActual<typeof import('./plans')>('./plans')
    vi.doMock('./plans', () => ({
      ...actual,
      // White-label folded down into the Business depth: nothing else changes.
      planEntitlementKeys: (plan: SpacePlan) =>
        plan === 'business' ? [...actual.BUSINESS_DEPTH_ENTITLEMENT_KEYS, 'whitelabel'] : actual.planEntitlementKeys(plan),
    }))
    const mod = await import('./pricing-grid')
    const moved = mod.spaceFeatureGrid(input)
    const cells = Object.fromEntries(
      moved.columns.map((c, i) => [c.id, row(moved, 'whitelabel').cells[i]!.text]),
    )
    expect(cells.business).toBe('Included')
    // And the unmocked grid still reads the real answer, so this is the key set talking, not a literal.
    expect(cellsByColumn(spaceFeatureGrid(input), 'whitelabel').business).toBe('Not included')
  })

  it('flips the AI add-on row to Included when its keys join a tier base', async () => {
    const actual = await vi.importActual<typeof import('./plans')>('./plans')
    vi.doMock('./plans', () => ({
      ...actual,
      planEntitlementKeys: (plan: SpacePlan) =>
        plan === 'collective'
          ? [...actual.COLLECTIVE_DEPTH_ENTITLEMENT_KEYS, ...actual.ADDON_ENTITLEMENT_KEYS.ai]
          : actual.planEntitlementKeys(plan),
    }))
    const mod = await import('./pricing-grid')
    const moved = mod.spaceFeatureGrid(input)
    const cells = Object.fromEntries(moved.columns.map((c, i) => [c.id, row(moved, 'addon_ai').cells[i]!.text]))
    expect(cells.collective).toBe('Included')
    expect(cells.business).toContain('Add-on')
  })
})

// ── The grid obeys the OPERATOR's gates, not just the code map (ADR-880) ────────────────────────────
// featureAllowed resolves mergeGate(feature, await loadFeatureGateOverrides()); the grid used to read
// FEATURE_GATES directly, so an operator who RAISED a gate at /admin/pricing left this page promising
// a feature the product would then refuse. The page resolves the overrides and threads them in.

describe('operator gate overrides move the comparison cell', () => {
  it('raising space_crm to Collective drops the Business cell to Not included', () => {
    // The code map gates space_crm at 'business', so the Business column reads Included today.
    expect(cellsByColumn(spaceFeatureGrid(input), 'space_storefront').free).toBe('Included')
    const raised = spaceFeatureGrid({
      ...input,
      gateOverrides: { space_storefront: { minEntitlement: 'collective' } },
    })
    const cells = cellsByColumn(raised, 'space_storefront')
    expect(cells.free).toBe('Not included')
    expect(cells.business).toBe('Not included')
    expect(cells.collective).toBe('Included')
    // The unmocked grid still reads the code answer, so this is the override talking.
    expect(cellsByColumn(spaceFeatureGrid(input), 'space_storefront').business).toBe('Included')
  })

  it('DISABLING a gate opens the row on every column (a disabled gate never blocks)', () => {
    const opened = spaceFeatureGrid({
      ...input,
      gateOverrides: { space_collaborators: { enabled: false } },
    })
    expect(cellsByColumn(opened, 'space_collaborators').free).toBe('Included')
    expect(cellsByColumn(spaceFeatureGrid(input), 'space_collaborators').free).toBe('Not included')
  })

  it('a member-ladder gate follows its override too', () => {
    const raised = memberFeatureGrid({
      ...input,
      gateOverrides: { gamification_full: { enabled: false } },
    })
    const cells = Object.fromEntries(
      raised.columns.map((c, i) => [c.id, row(raised, 'gamification_full').cells[i]!.text]),
    )
    expect(cells.member).toBe('Included')
  })

  it('an INVALID override never widens a gate (mergeGate validates the ladder)', () => {
    const nonsense = spaceFeatureGrid({
      ...input,
      gateOverrides: { space_collaborators: { minEntitlement: 'not-a-tier' } },
    })
    expect(cellsByColumn(nonsense, 'space_collaborators').free).toBe('Not included')
  })

  it('no overrides is exactly the code map (today\'s behavior, unchanged)', () => {
    expect(spaceFeatureGrid({ ...input, gateOverrides: {} })).toEqual(spaceFeatureGrid(input))
  })
})

// ── The page itself carries no price ────────────────────────────────────────────────────────────────

describe('source-shape guard: /pricing hard-codes no money', () => {
  const pagePath = join(process.cwd(), 'app', '(marketing)', 'pricing', 'page.tsx')
  const source = readFileSync(pagePath, 'utf8')

  it('contains no dollar literal at all (every figure formats from config)', () => {
    // Strip comments first: a comment may legitimately explain the ladder in dollars.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    const literals = code.match(/\$\s?\d[\d,]*(\.\d+)?/g) ?? []
    expect(literals, 'prices must come from the pricing config, never a literal').toEqual([])
  })

  it('quotes no bare percentage either (the take-rate comes from take_rate.network_bps)', () => {
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    expect(code.match(/\b\d{1,2}%/g) ?? []).toEqual([])
  })

  it('resolves the beta window and the operator gate overrides, and hands BOTH to the grid (ADR-880)', () => {
    // A page that resolves either one differently from the product is a page that lies: the price it
    // prints must be the one the checkout takes, and the gate it promises must be the one enforced.
    expect(source).toContain('isBetaPricingActive()')
    expect(source).toContain('loadFeatureGateOverrides()')
    expect(source).toContain('betaActive')
    expect(source).toContain('gateOverrides')
  })

  it('renders the grid from the pure model, not a hand-rolled table of tiers', () => {
    expect(source).toContain('pricing-grid')
    // The retired per-business-style package strip is gone (the grid carries that weight now).
    expect(source).not.toContain('loadoutStrip')
    expect(source).not.toContain('By who you are')
  })
})
