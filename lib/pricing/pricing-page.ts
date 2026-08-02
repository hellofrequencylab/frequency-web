// PRICING COPY MODEL — the PURE shaping of the marketing/AIO pricing surfaces (the "by who you are"
// loadout strip, the interpolable price strings every FAQ answer reads, and the answer-engine ladder
// summary /llms.txt and /llms-full.txt print).
//
// THIS IS NOT A SECOND LADDER (Phase 5, ADR-916). lib/pricing/pricing-grid.ts is THE derived model:
// every offering, every rate, every comparison cell is resolved there from the gates, the meters, the
// entitlement key sets, and the operator-editable config. This module READS it (pricingTiers and
// pricingLadderSummary both build on spaceOfferings / allOfferings) and adds only the copy the grid does
// not carry. It used to type its own take-rate strings, which is how the answer-engine corpus published
// a fee ladder /pricing had already stopped showing.
//
// PRICES come from the catalog (lib/billing/pricing-keys.ts CATALOG, surfaced through
// lib/pricing/catalog-config.ts), defaulting to the CODE amounts so a static caller needs no DB read. A
// caller that CAN reach the operator's config (the llms routes, which already read the DB) passes it in,
// so an edit at /admin/pricing moves the published ladder in the same revalidation it moves /pricing.
//
// PURE + framework-independent (no React / Stripe / Supabase / Next), so it is trivially unit-testable.
//
// VOICE NOTE (CONTENT-VOICE §10): every string here is plain, honest, skeptic-proof, names what the
// thing is, never narrates the reader's feelings, makes no health claim, and uses NO em dashes. The
// money is the offer; the numbers carry the weight.

import {
  catalogConfigByKey,
  defaultCatalogConfig,
  PWYW_CONFIG_DEFAULT,
  type ResolvedCatalogItem,
} from './catalog-config'
import {
  computeLoadoutTotal,
  formatLoadoutCents,
  type LoadoutTotal,
} from './loadout'
import type { AddonKey } from './plans'
import { PLACEHOLDER_MEMBER_PRICE_CENTS } from './feature-tiers'
import { isBetaPricingActive, effectiveCatalogAmounts } from './beta'
import { PRICING_DEFAULTS, type PricingDefaults } from './defaults'
import { allOfferings, spaceOfferings, type Offering } from './pricing-grid'
import {
  type BillingInterval,
  type CatalogAmounts,
  type CatalogItemKey,
} from '@/lib/billing/pricing-keys'

// ── A money amount rendered both intervals (the table + strip show monthly with a yearly toggle) ─────

/** A price rendered at both intervals, with the list anchor and the founding (charged) amount each. All
 *  cents, plain. The page toggles which interval is shown; both are computed once, statically. */
export interface DualPrice {
  /** The monthly amounts (list anchor + founding charged). */
  month: CatalogAmounts
  /** The yearly amounts (two months free, derived in the catalog). */
  year: CatalogAmounts
}

/** The resolved catalog items, keyed, from the CODE defaults only (no DB). The single source the page +
 *  the strip read, so the static page never touches the billing tables. PURE. */
export function pricingCatalog(): Record<CatalogItemKey, ResolvedCatalogItem> {
  return catalogConfigByKey(defaultCatalogConfig())
}

// ── The plain price strings every COPY surface interpolates (never hardcode a dollar figure) ─────────

/** The formatted monthly price strings, computed once from the code catalog. Marketing copy (metadata,
 *  FAQ answers, persona pages, funnel beats) interpolates THESE instead of hardcoding "$29"/"$19"/...,
 *  so a catalog change reflows every sentence that quotes a price. PURE data. */
export interface PriceStrings {
  /** Business list, e.g. "$29". */
  businessList: string
  /** Business Opening Beta anchor (the charged price during beta), e.g. "$19". */
  businessBeta: string
  /** Collective list, e.g. "$79". */
  collectiveList: string
  /** Collective Opening Beta anchor, e.g. "$49". */
  collectiveBeta: string
  /** Non Profit flat, e.g. "$39". */
  nonprofit: string
  /** The Vera AI add-on monthly, e.g. "$20". */
  veraAi: string
  /** The Vera AI add-on yearly, e.g. "$200". */
  veraAiYear: string
}

/** Build the interpolable price strings from the ONE code catalog. PURE. */
export function priceStrings(): PriceStrings {
  const cat = pricingCatalog()
  return {
    businessList: formatLoadoutCents(cat.business_base.month.listCents),
    businessBeta: formatLoadoutCents(cat.business_base.month.foundingCents),
    collectiveList: formatLoadoutCents(cat.collective_base.month.listCents),
    collectiveBeta: formatLoadoutCents(cat.collective_base.month.foundingCents),
    nonprofit: formatLoadoutCents(cat.nonprofit_seat.month.foundingCents),
    veraAi: formatLoadoutCents(cat.addon_ai.month.foundingCents),
    veraAiYear: formatLoadoutCents(cat.addon_ai.year.foundingCents),
  }
}

/** The one narrative spine every pricing/marketing surface can reuse verbatim (owner plan story,
 *  2026-07): what is free, what a paid plan buys, stated so a skeptic believes it. No em dashes. */
export const PLAN_STORY = {
  /** The whole spine in one breath. */
  spine:
    'Frequency is where your local community happens. Connection is free. Businesses pay for reach and scale, never for access to people. Paid plans raise the limits.',
  /** The meter framing: paid is how much, never whether. */
  meters: 'Everything is included. Paid plans raise the limits.',
  /** The honest founding-rate framing, tied to the Summer of Frequency banner language. */
  founding: 'Opening Beta rates hold through the Summer of Frequency and stay locked for as long as you keep the plan.',
} as const

// ── The three commercial tiers (the pricing TABLE columns) ──────────────────────────────────────────

/** The price MODEL for one tier column (ADR-552). `kind` decides how the headline price reads:
 *  - `flat`   : a list anchor struck over a founding price (Business).
 *  - `perSeat`: the same, but per licensed seat (Non Profit). */
export type TierPriceKind = 'flat' | 'perSeat' | 'from'

/** One add-on row value in a tier column: a price string for Pro, or a plain "included" / coverage note
 *  for the higher tiers. ADR-472: the AI Engine is the only metered add-on, so a tier carries one cell. */
export interface TierAddonCell {
  /** The add-on this cell is for. */
  addon: AddonKey
  /** What the cell reads in this column (e.g. "+$20/mo", "Included"). */
  value: string
}

/** One commercial tier column of the pricing table. Pure data the page renders. */
export interface PricingTier {
  /** A stable id for keys + JSON-LD (`free` / `business` / `collective` / `nonprofit` / `independent`). */
  id: 'free' | 'business' | 'nonprofit' | 'collective' | 'independent'
  /** The display name. */
  name: string
  /** The rung identity in a few words (the card's one-liner, e.g. "Own your audience."). */
  tagline: string
  /** How the headline price reads. */
  priceKind: TierPriceKind
  /** The dual-interval price for the headline (Pro base / nonprofit seat / org floor). */
  price: DualPrice
  /** Whether this tier is the highlighted, most-chosen column (Pro). */
  featured: boolean
  /** One plain line on who the tier is for. */
  forWho: string
  /** The plain billing line (monthly / yearly, per seat, or sales-assist). */
  billing: string
  /** The core-included summary line. */
  coreIncluded: string
  /** The add-on cells in this column (ADR-472: the AI Engine is the only metered add-on). */
  addons: TierAddonCell[]
  /** The take-rate line (the network-only story: 0% on your own, tier rate on network sales). */
  takeRate: string
  /** The CTA for this column: a label + href. */
  cta: { label: string; href: string }
  // `preview?: boolean` used to sit here, for a tier with no catalog entry. Every tier has one now, so
  // nothing ever set it and the ladder summary's "(coming soon)" branch was unreachable. Deleted with it.
}

/** The metered add-ons in display order, with their plain marketing labels + the glyph the table prints
 *  beside them. The price comes from the catalog (so a config change is one number). ADR-472: the AI
 *  Engine is now the SOLE metered add-on; Marketing, Team, and Branding folded into Business tier depth. */
export const PRICING_ADDONS: readonly { key: AddonKey; glyph: string; label: string; turnsOn: string }[] = [
  // Listed as "Vera AI" (owner, 2026-07 pricing overhaul): Vera is the one system voice (ADR-231); the
  // Resonance Engine machinery powers it under the hood. The catalog key stays addon_ai.
  { key: 'ai', glyph: '🧠', label: 'Vera AI', turnsOn: "Turns your community's signals into live matches and next-best actions." },
]

/** The catalog item key for a metered add-on (ai -> addon_ai). PURE. */
function addonItemKey(addon: AddonKey): CatalogItemKey {
  return `addon_${addon}` as CatalogItemKey
}

/** The add-on price string on a paid tier, e.g. "+$20/mo". PURE. `catalog` defaults to the code catalog;
 *  a caller holding the operator's resolved catalog passes it so the figure moves with an admin edit. */
export function proAddonPrice(
  addon: AddonKey,
  catalog: Record<CatalogItemKey, ResolvedCatalogItem> = pricingCatalog(),
): string {
  const item = catalog[addonItemKey(addon)]
  const amount = formatLoadoutCents(item.month.foundingCents)
  return item.perSeat ? `+${amount}/seat/mo` : `+${amount}/mo`
}

/** The label an offering reads under in a FLAT ladder list (a table column, a bullet list, an
 *  answer-engine line) rather than in a grid with a member/Space heading over it. The only adjustment is
 *  the free Space, whose canon label is the bare word "Free": in a flat list beside the free Member rung
 *  that is ambiguous, so it reads "Free Space". Every other label comes straight from the naming canon.
 *  PURE, and shared by every flat-list caller so they cannot disagree. */
export function offeringLadderLabel(offering: Offering): string {
  return offering.axis === 'plan' && offering.tier === 'free' ? 'Free Space' : offering.label
}

/** The catalog item each SPACE tier is priced from. Free has none ($0 is not a Stripe price). PURE. */
const TIER_ITEM: Record<Exclude<PricingTier['id'], 'free'>, CatalogItemKey> = {
  business: 'business_base',
  collective: 'collective_base',
  nonprofit: 'nonprofit_seat',
  independent: 'independent_base',
}

/** The core-included summary per tier. COPY ONLY, and deliberately free of any number: every figure a
 *  column states (its price, its anchor, its take-rate, its add-on cell) is READ from the shared model
 *  below, so a rewrite of this prose can never move a price and a price change can never leave this
 *  prose stale. The lines that used to carry rate literals ("5% on network-sourced sales") are gone. */
const TIER_CORE_INCLUDED: Record<PricingTier['id'], string> = {
  free: 'Your storefront and page, host events, post, gather members, and be a Collaborator on other Spaces’ events.',
  business:
    'Unlimited contacts, campaigns at volume, email branding, and exports: the full CRM, email, reporting, bookings, tickets, memberships, and your own website.',
  collective:
    'Everything in Business, plus team seats, automations, membership-included tickets, multiple pipelines, and hosting events with Collaborator Spaces.',
  nonprofit:
    'The full Collective toolkit for verified nonprofits, with donations built in. Flat, never per seat.',
  independent:
    'Everything in Collective, plus your own brand and custom domain. Standalone, off the network, so there is no network take-rate at all.',
}

/** The CTA per tier. Copy + route only. */
const TIER_CTA: Record<PricingTier['id'], { label: string; href: string }> = {
  free: { label: 'Start free', href: '/spaces' },
  business: { label: 'Start a Space', href: '/spaces' },
  collective: { label: 'Start a Space', href: '/spaces' },
  nonprofit: { label: 'Get verified', href: '/spaces' },
  independent: { label: 'Start a Space', href: '/spaces' },
}

/** Build the FIVE public Space tier columns: Free Space FIRST (the first level of Space, where the core
 *  value lives), then Business, Collective, Non Profit, and Independent.
 *
 *  DERIVED FROM THE GRID (Phase 5, ADR-916). The column order, the labels, the taglines, the who-it-is-for
 *  lines, and every take-rate now come from lib/pricing/pricing-grid.ts spaceOfferings, the one derived
 *  model /pricing itself renders. This function used to type its own take-rate strings, which is how
 *  /llms.txt and /llms-full.txt ended up publishing a fee ladder an operator edit could not move. Prices
 *  still come through the catalog here (the ladder lines need cents at both intervals, which an Offering
 *  does not carry), from the SAME catalog the offerings are priced from.
 *
 *  INDEPENDENT IS DISPLAYED. The old comment here said it was not, and then returned it anyway, so the
 *  answer-engine corpus published a tier the comment claimed was hidden. The ruling (Phase 5): Independent
 *  is a real, published tier on every PUBLIC surface, exactly as /pricing already shows it; what it is not
 *  is an upgrade path offered inside the app, which is the in-app plan ladder's own, separate decision.
 *
 *  PURE. `values` defaults to the code take-rates; a caller with the operator's resolved config (the
 *  llms.txt routes) passes them in, so an edit at /admin/pricing moves the published ladder too. */
export function pricingTiers(
  betaActive: boolean = isBetaPricingActive(),
  opts: { values?: PricingDefaults; catalog?: Record<CatalogItemKey, ResolvedCatalogItem> } = {},
): PricingTier[] {
  const cat = opts.catalog ?? pricingCatalog()
  const values = opts.values ?? PRICING_DEFAULTS
  const offerings = spaceOfferings({ values, catalog: cat, betaActive })

  // Vera AI is the only metered add-on. It is priced on, and available on, every paid tier.
  const tierAddons: TierAddonCell[] = PRICING_ADDONS.map((a) => ({ addon: a.key, value: proAddonPrice(a.key, cat) }))

  // BETA AUTO-REVERT (ADR-811): during beta, Business/Collective show their Opening Beta anchor struck
  // under the list; once beta ends the list becomes the price (no strike, no beta caption).
  // effectiveCatalogAmounts mirrors what the checkout charges, so the table never quotes a price the
  // checkout won't honor.
  const eff = (a: CatalogAmounts) => effectiveCatalogAmounts(a, betaActive)

  // Free has no catalog item ($0 is not a Stripe price); a zeroed DualPrice renders as "Free".
  const zero: CatalogAmounts = { listCents: 0, foundingCents: 0 }

  return offerings.map((o): PricingTier => {
    const id = o.id as PricingTier['id']
    const item = id === 'free' ? null : cat[TIER_ITEM[id]]
    return {
      id,
      name: offeringLadderLabel(o),
      tagline: o.tagline,
      priceKind: 'flat',
      price: item ? { month: eff(item.month), year: eff(item.year) } : { month: zero, year: zero },
      featured: o.featured,
      forWho: o.forWho,
      billing: o.billing,
      coreIncluded: TIER_CORE_INCLUDED[id],
      addons: item ? tierAddons : [],
      takeRate: o.takeRate,
      cta: TIER_CTA[id],
    }
  })
}

/** The headline price string for a tier at an interval, e.g. "$19/mo", "$12/seat/mo", "from $199/mo".
 *  PURE. The page renders the list anchor struck through over this separately. */
export function tierHeadline(tier: PricingTier, interval: BillingInterval): string {
  const amounts = interval === 'month' ? tier.price.month : tier.price.year
  // The Free Space column: $0 is not a price, it is the absence of one.
  if (amounts.foundingCents <= 0) return 'Free'
  const amount = formatLoadoutCents(amounts.foundingCents)
  const suffix = interval === 'month' ? '/mo' : '/yr'
  if (tier.priceKind === 'perSeat') return `${amount}/seat${suffix}`
  if (tier.priceKind === 'from') return `from ${amount}${suffix}`
  return `${amount}${suffix}`
}

/** The struck-through LIST anchor string for a tier at an interval, e.g. "$29". PURE. Returns null when
 *  the list equals the founding (no anchor to show). */
export function tierListAnchor(tier: PricingTier, interval: BillingInterval): string | null {
  const amounts = interval === 'month' ? tier.price.month : tier.price.year
  if (amounts.listCents <= amounts.foundingCents) return null
  return formatLoadoutCents(amounts.listCents)
}

// ── The "by who you are" loadout strip (each Mode -> its recommended loadout + monthly total) ─────────

/** One row of the "by who you are" strip: a Mode's plain label, its recommended add-on loadout, the
 *  computed monthly founding total, and the persona page it links to. Pure data. */
export interface LoadoutStripRow {
  /** A stable id (the persona slug, e.g. "coaches"). */
  id: string
  /** The plain Mode label, e.g. "Coach". */
  label: string
  /** The persona page path this row links to. */
  href: string
  /** The active add-ons this loadout turns on (atop the Pro base). */
  addons: AddonKey[]
  /** The computed loadout total at the monthly interval (the headline number). */
  total: LoadoutTotal
  /** The plain monthly total label, e.g. "$59/mo" or "$12/seat/mo" for the Nonprofit row. */
  totalLabel: string
  /** When the total is the plan PLUS a metered add-on, the plain breakdown of where it comes from, e.g.
   *  "$19 plan + $20 Vera AI". Null when the total already IS the plan price (a Business-only
   *  door, or the flat Nonprofit plan), so no bare higher number ever reads as the plan price. */
  breakdownLabel: string | null
  /** A plain one-line note on what the loadout is for. */
  note: string
  /** True for the Nonprofit row: per-seat plan, not a Pro loadout. */
  perSeat: boolean
}

/** The recommended-loadout definition per persona, the single source the strip + the persona pages read.
 *  The add-on set drives the live total via computeLoadoutTotal, so the prices are never hardcoded: a
 *  catalog change reflows every figure. Nonprofit is per-seat (no Pro loadout), so it carries an
 *  explicit per-seat headline instead of a computed Pro total. */
export interface PersonaLoadout {
  /** The persona slug (the /for/<slug> route + the strip id). */
  slug: string
  /** The plain Mode label. */
  label: string
  /** The add-ons atop the Pro base (empty for the Pro-only event space). */
  addons: AddonKey[]
  /** A plain one-line note. */
  note: string
  /** True for the Nonprofit row: it is a per-seat plan, not a Pro loadout. */
  perSeat?: boolean
}

/** The FIVE persona doors (ADR-590): one system, presented by who they are. Each resolves to Business,
 *  Business + Resonance, or the Nonprofit plan. Coaches/healers and community builders turn the Resonance
 *  Engine on (Business + Resonance = $19 + $20/mo at founding); studios and event hosts run on Business
 *  ($19/mo founding); nonprofits run the flat Nonprofit plan ($39/mo). The monthly totals come from the
 *  catalog, never hardcoded, so a catalog change reflows every figure. */
export const PERSONA_LOADOUTS: readonly PersonaLoadout[] = [
  { slug: 'coaches-and-healers', label: 'Coaches and healers', addons: ['ai'], note: 'Packages, scheduling, and a client CRM that suggests who to follow up with.' },
  { slug: 'studios', label: 'Studios', addons: [], note: 'Classes, memberships, and check-in at the door.' },
  { slug: 'event-hosts', label: 'Event hosts', addons: [], note: 'Tickets, check-in, and a message to everyone who has one.' },
  { slug: 'community-builders', label: 'Community builders', addons: ['ai'], note: 'Circles, memberships, and matches between the right people.' },
  { slug: 'nonprofits', label: 'Nonprofits', addons: [], note: 'Donations, supporters, and programs.', perSeat: true },
]

/** The /for/<slug> path for a persona. Canonical everywhere. PURE. */
export function personaPath(slug: string): string {
  return `/for/${slug}`
}

/** The plain monthly total LABEL for a persona loadout, e.g. "$59/mo", or the per-seat headline for the
 *  Nonprofit row ("$12/seat/mo"). PURE — the strip and the persona page render this so the math never
 *  drifts between them. */
export function stripTotalLabel(p: PersonaLoadout, betaActive: boolean = isBetaPricingActive()): string {
  if (p.perSeat) {
    // The Nonprofit door: priced from the flat Non Profit plan ($39/mo, ADR-811), not a Business loadout.
    // The `perSeat` field name is legacy (per-seat billing is retired); it now flags "the flat nonprofit
    // sibling." Renders a FLAT figure, never per seat. No founder discount, so beta-invariant.
    const np = pricingCatalog().nonprofit_seat
    return `${formatLoadoutCents(np.month.foundingCents)}/mo`
  }
  // BETA AUTO-REVERT (ADR-811): during the founder window the strip headlines the beta total; after the
  // cutover it headlines the list total, matching the /pricing table + the checkout so no surface quotes a
  // price another one won't honor.
  const total = computeLoadoutTotal(pricingCatalog(), p.addons, 'month', 1)
  return `${formatLoadoutCents(betaActive ? total.foundingCents : total.listCents)}/mo`
}

/** The plain add-on label for the strip breakdown, e.g. "Vera AI" (from PRICING_ADDONS). Local
 *  to this module so the breakdown never pulls in the personas layer (which imports this one). PURE. */
function stripAddonLabel(addon: AddonKey): string {
  return PRICING_ADDONS.find((a) => a.key === addon)?.label ?? addon
}

/** The plain breakdown of a loadout total, e.g. "$19 plan + $20 Vera AI", so a door whose
 *  recommended loadout adds a metered add-on shows WHERE the total comes from and never reads as a bare
 *  higher plan price. Returns null when there is nothing to break down: the flat Nonprofit plan, or a
 *  Business-only door with no add-on (the total already IS the Business plan price). PURE. */
export function stripBreakdownLabel(p: PersonaLoadout, betaActive: boolean = isBetaPricingActive()): string | null {
  if (p.perSeat || p.addons.length === 0) return null
  const cat = pricingCatalog()
  // The Business base carries the founder-window discount; the add-on (Vera AI) does not, so only
  // the base flips to list after the cutover. Mirrors stripTotalLabel so the breakdown always sums to it.
  const base = `${formatLoadoutCents(betaActive ? cat.business_base.month.foundingCents : cat.business_base.month.listCents)} plan`
  const addonParts = p.addons.map((addon) => {
    const item = cat[addonItemKey(addon)]
    return `${formatLoadoutCents(item.month.foundingCents)} ${stripAddonLabel(addon)}`
  })
  return [base, ...addonParts].join(' + ')
}

/** Build one "by who you are" strip row from a persona loadout, computing its live monthly total from
 *  the CODE catalog. PURE. */
export function loadoutStripRow(p: PersonaLoadout, betaActive: boolean = isBetaPricingActive()): LoadoutStripRow {
  const total = computeLoadoutTotal(pricingCatalog(), p.addons, 'month', 1)
  return {
    id: p.slug,
    label: p.label,
    href: personaPath(p.slug),
    addons: [...p.addons],
    total,
    totalLabel: stripTotalLabel(p, betaActive),
    breakdownLabel: stripBreakdownLabel(p, betaActive),
    note: p.note,
    perSeat: !!p.perSeat,
  }
}

/** Every "by who you are" strip row, in plan order. PURE. Beta-aware: the strip totals flip from the
 *  founder-window price to list on the cutover, matching the /pricing table + checkout. */
export function loadoutStrip(betaActive: boolean = isBetaPricingActive()): LoadoutStripRow[] {
  return PERSONA_LOADOUTS.map((p) => loadoutStripRow(p, betaActive))
}

// ── Mission framing + the answer-engine ladder summary ──────────────────────────────────────────────

/** The one mission-framing line (PRICING-LADDER-PLAN §1a). Plain, no guilt, skeptic-proof: it states
 *  what a paid plan funds, in concrete terms. No em dashes. */
export const MISSION_FRAMING =
  'Frequency is a community collective. We exist to support and create community. A paid plan keeps the collective independent and funds the people and infrastructure behind it, so a Space is funding the work, not just renting software.'

/** The member (personal) pricing note every marketing and AIO surface interpolates. The member ladder is
 *  exactly two rungs (ADR-878): Member is free, and Crew is one clean price, monthly or yearly. No
 *  crossed-out anchor, no third tier. The personal ladder lives on /upgrade; the commercial page notes it
 *  and links there.
 *
 *  BOTH figures are read, never typed (Phase 5, ADR-916): the monthly from the ONE member-price map
 *  (feature-tiers), the yearly from the same two-months-free math the catalog itself uses. The yearly
 *  used to be the literal "$90 a year" in this sentence. */
export const CREW_NOTE = (() => {
  // 🔴 CREW IS PAY-WHAT-YOU-WANT. `foundingLabel` is the FLOOR, not a price, and every surface that
  // interpolates it must read as "from". It said "$9 a month" until now, which was a fixed figure for
  // an offer that has no fixed figure.
  const floor = formatLoadoutCents(PLACEHOLDER_MEMBER_PRICE_CENTS.crew)
  const suggested = formatLoadoutCents(PWYW_CONFIG_DEFAULT.suggestedCents)
  return {
    name: 'Member pricing',
    foundingLabel: floor,
    suggestedLabel: suggested,
    /** The floor already carrying its "from", for the surfaces that interpolate ONE figure into a
     *  sentence ("Crew is {x} a month"). Offered as a field rather than left to each caller because
     *  every caller that had to remember the prefix forgot it, and the result was a marketing page
     *  quoting the cheapest possible Crew as the price of Crew. */
    fromLabel: `from ${floor}`,
    line: `Being a member is free, and stays free: joining, Circles, events, and the people. Crew is the personal tier and you pick what you pay: anything from ${floor} a month, ${suggested} suggested. Every amount buys the same thing, so pay what it is worth to you. It lives on the personal upgrade page.`,
    href: '/upgrade',
  } as const
})()

/** The options every ANSWER-ENGINE surface (llms.txt, llms-full.txt) resolves its ladder from. All
 *  optional: omitted, the summary reads the code defaults, which is what a pure/static caller wants.
 *  A route that can reach the operator's config passes it, so an edit at /admin/pricing moves the
 *  published corpus in the same revalidation as it moves /pricing. */
export interface LadderSummaryInput {
  values?: PricingDefaults
  catalog?: Record<CatalogItemKey, ResolvedCatalogItem>
  betaActive?: boolean
}

/** The pricing summary an answer engine can lift: the whole ladder, member rungs and Space rungs, plus
 *  the add-ons and the per-rung take-rates. PURE.
 *
 *  DERIVED FROM THE GRID (Phase 5, ADR-916). Every line is built from lib/pricing/pricing-grid.ts
 *  allOfferings, the same model /pricing renders, so the corpus an answer engine quotes is the page. It
 *  used to be assembled from hand-typed take-rate strings, which is how /llms.txt spent a release
 *  publishing a fee ladder the product had already retired. */
export function pricingLadderSummary(input: LadderSummaryInput = {}): string[] {
  const values = input.values ?? PRICING_DEFAULTS
  const catalog = input.catalog ?? pricingCatalog()
  const offerings = allOfferings({ values, catalog, betaActive: input.betaActive })
  const lines: string[] = [`- ${PLAN_STORY.spine}`]
  for (const o of offerings) {
    const price = o.listAnchor ? `${o.monthly} (list ${o.listAnchor})` : o.monthly
    // A pay-what-you-want rung carries "from" on BOTH figures, because each has to stand alone in a
    // table cell. Read as one sentence they stutter ("from $4.99/mo or from $49.90/yr"), so the second
    // "from" is dropped here — the qualifier is already established by the first.
    const yearly = o.yearly ? ` or ${price.startsWith('from ') ? o.yearly.replace(/^from /, '') : o.yearly}` : ''
    lines.push(
      `- ${offeringLadderLabel(o)}: ${price}${yearly}. ${o.tagline} ${o.forWho} Fee: ${o.takeRate}.`,
    )
  }
  for (const a of PRICING_ADDONS) {
    lines.push(`- ${a.label} add-on: ${proAddonPrice(a.key, catalog)}, optional on any paid plan.`)
  }
  lines.push('- Operator seats: add-on seats for your team on any paid plan, owner-priced.')
  return lines
}
