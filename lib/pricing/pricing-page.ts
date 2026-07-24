// PRICING PAGE MODEL — the PURE shaping of the public commercial pricing page (Phase F1, Modes M6;
// docs/PRICING-LADDER-PLAN.md §4 + docs/SPACE-MODES-PLAN.md §4b). The commercial /pricing page is
// STATIC: it renders entirely from the CODE catalog (lib/billing/pricing-keys.ts CATALOG, surfaced via
// lib/pricing/catalog-config.ts defaultCatalogConfig) and the pure loadout math (lib/pricing/loadout.ts
// computeLoadoutTotal), so there are ZERO per-request DB billing reads. This module turns those code
// defaults into the table model (Business / Non Profit) and the "by who you are" loadout strip the page
// renders, plus the JSON-LD Offer inputs and the answer-engine ladder summary. PURE +
// framework-independent (no React / Stripe / Supabase / Next), so it is trivially unit-testable and
// shared by the page render, the JSON-LD spine, and the llms.txt ladder line.
//
// VOICE NOTE (CONTENT-VOICE §10): every string here is plain, honest, skeptic-proof, names what the
// thing is, never narrates the reader's feelings, makes no health claim, and uses NO em dashes. The
// money is the offer; the numbers carry the weight.

import {
  catalogConfigByKey,
  defaultCatalogConfig,
  type ResolvedCatalogItem,
} from './catalog-config'
import {
  computeLoadoutTotal,
  formatLoadoutCents,
  type LoadoutTotal,
} from './loadout'
import type { AddonKey } from './plans'
import { PLACEHOLDER_SPACE_PRICE_CENTS, COLLECTIVE_BETA_CENTS } from './feature-tiers'
import type { BillingInterval, CatalogAmounts, CatalogItemKey } from '@/lib/billing/pricing-keys'

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
  /** A stable id for keys + JSON-LD (`business` / `nonprofit` / `collective` / `independent`). */
  id: 'business' | 'nonprofit' | 'collective' | 'independent'
  /** The display name. */
  name: string
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
  /** True for a tier that is NOT yet sellable (Collective / Independent have no catalog entry until
   *  go-live), so the page shows it as a "coming soon" preview row, never a live checkout (ADR-811). */
  preview?: boolean
}

// ── Preview pricing for the not-yet-sellable tiers (Collective / Independent, ADR-811) ────────────────
// These have no Stripe/code catalog entry until go-live, so the page prices them from the ONE placeholder
// map (feature-tiers PLACEHOLDER_SPACE_PRICE_CENTS) and marks them preview. Yearly = two months free (10x
// monthly), the same math the catalog uses. Collective carries the beta founding anchor (COLLECTIVE_BETA_CENTS,
// imported from feature-tiers so it never drifts from the in-app ladder) under its list.

/** Build a DualPrice for a preview tier from a monthly LIST cents and an optional lower FOUNDING cents
 *  (the beta anchor). Yearly is two months free (10x monthly). PURE. */
function previewDualPrice(monthlyListCents: number, monthlyFoundingCents = monthlyListCents): DualPrice {
  return {
    month: { listCents: monthlyListCents, foundingCents: monthlyFoundingCents },
    year: { listCents: monthlyListCents * 10, foundingCents: monthlyFoundingCents * 10 },
  }
}

/** The metered add-ons in display order, with their plain marketing labels + the glyph the table prints
 *  beside them. The price comes from the catalog (so a config change is one number). ADR-472: the AI
 *  Engine is now the SOLE metered add-on; Marketing, Team, and Branding folded into Business tier depth. */
export const PRICING_ADDONS: readonly { key: AddonKey; glyph: string; label: string; turnsOn: string }[] = [
  { key: 'ai', glyph: '🧠', label: 'Resonance Engine', turnsOn: "Turns your community's signals into live matches and next-best actions." },
]

/** The catalog item key for a metered add-on (ai -> addon_ai). PURE. */
function addonItemKey(addon: AddonKey): CatalogItemKey {
  return `addon_${addon}` as CatalogItemKey
}

/** The add-on price string on a paid tier, e.g. "+$20/mo". PURE. */
export function proAddonPrice(addon: AddonKey): string {
  const item = pricingCatalog()[addonItemKey(addon)]
  const amount = formatLoadoutCents(item.month.foundingCents)
  return item.perSeat ? `+${amount}/seat/mo` : `+${amount}/mo`
}

/** Build the FOUR commercial tier columns (ADR-811): Business + Non Profit are sellable from the CODE
 *  catalog; Collective + Independent are PREVIEW rows priced from the placeholder map (no catalog entry
 *  until go-live) and flagged `preview`. PURE — no DB, no per-request read. The add-on cells carry only the
 *  AI Engine: metered on Business, available on every paid tier. */
export function pricingTiers(): PricingTier[] {
  const cat = pricingCatalog()

  // The AI Engine is the only metered add-on. It is priced on Business and available on every paid tier.
  const tierAddons: TierAddonCell[] = PRICING_ADDONS.map((a) => ({ addon: a.key, value: proAddonPrice(a.key) }))

  return [
    {
      id: 'business',
      name: 'Business',
      priceKind: 'flat',
      price: { month: cat.business_base.month, year: cat.business_base.year },
      featured: true,
      forWho: 'Coaches, service and product businesses, studios, and practitioners.',
      billing: 'Monthly or yearly. Yearly is two months free.',
      coreIncluded:
        'Run your practice: the full CRM, email, reporting, bookings, tickets, memberships, and your own website.',
      addons: tierAddons,
      takeRate: '0% on your own bookings, 5% on network-sourced sales',
      cta: { label: 'Start a Space', href: '/spaces' },
    },
    {
      id: 'collective',
      name: 'Collective',
      priceKind: 'flat',
      // Preview: no catalog entry until go-live. $79 list, $49 beta founding (strategy).
      price: previewDualPrice(PLACEHOLDER_SPACE_PRICE_CENTS.collective, COLLECTIVE_BETA_CENTS),
      featured: false,
      forWho: 'Growing communities that collaborate and run a team.',
      billing: 'Monthly or yearly. Beta founding price locked for early Collectives.',
      coreIncluded:
        'Everything in Business, plus automations, team roles, multiple pipelines, and hosting collaborators inside your space.',
      addons: tierAddons,
      takeRate: '0% on your own bookings, 3% on network-sourced sales',
      cta: { label: 'Coming soon', href: '/spaces' },
      preview: true,
    },
    {
      id: 'nonprofit',
      name: 'Non Profit',
      priceKind: 'flat',
      price: { month: cat.nonprofit_seat.month, year: cat.nonprofit_seat.year },
      featured: false,
      forWho: 'Verified 501(c)(3) organizations.',
      billing: 'Monthly or yearly. Yearly is two months free.',
      coreIncluded:
        'The full Collective toolkit for verified nonprofits, with donations built in. Flat, never per seat.',
      addons: tierAddons,
      takeRate: '0%, always',
      cta: { label: 'Get verified', href: '/spaces' },
    },
    {
      id: 'independent',
      name: 'Independent',
      priceKind: 'flat',
      // Preview: the standalone / white-label tier. Standard SaaS pricing (~$249), off the network.
      price: previewDualPrice(PLACEHOLDER_SPACE_PRICE_CENTS.independent),
      featured: false,
      forWho: 'Teams that want their own brand and domain, standalone.',
      billing: 'Monthly or yearly. Standalone, outside the collective.',
      coreIncluded:
        'Everything in Collective, plus your own brand and custom domain, badge off. Off the network, so standard pricing.',
      addons: tierAddons,
      takeRate: '0%. Standalone, off the network',
      cta: { label: 'Coming soon', href: '/spaces' },
      preview: true,
    },
  ]
}

/** The headline price string for a tier at an interval, e.g. "$19/mo", "$12/seat/mo", "from $199/mo".
 *  PURE. The page renders the list anchor struck through over this separately. */
export function tierHeadline(tier: PricingTier, interval: BillingInterval): string {
  const amounts = interval === 'month' ? tier.price.month : tier.price.year
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
   *  "$29 plan + $20 Resonance Engine". Null when the total already IS the plan price (a Business-only
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
 *  Engine on (Business + Resonance = $29 + $20/mo); studios and event hosts run on Business ($29/mo); nonprofits
 *  run the flat Nonprofit plan ($29/mo). The monthly totals come from the catalog, never hardcoded, so a
 *  catalog change reflows every figure. */
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
export function stripTotalLabel(p: PersonaLoadout): string {
  if (p.perSeat) {
    // The Nonprofit door: priced from the flat Non Profit plan ($29/mo, ADR-590), not a Business loadout.
    // The `perSeat` field name is legacy (per-seat billing is retired); it now flags "the flat nonprofit
    // sibling." Renders a FLAT figure, never per seat.
    const np = pricingCatalog().nonprofit_seat
    return `${formatLoadoutCents(np.month.foundingCents)}/mo`
  }
  const total = computeLoadoutTotal(pricingCatalog(), p.addons, 'month', 1)
  return `${formatLoadoutCents(total.foundingCents)}/mo`
}

/** The plain add-on label for the strip breakdown, e.g. "Resonance Engine" (from PRICING_ADDONS). Local
 *  to this module so the breakdown never pulls in the personas layer (which imports this one). PURE. */
function stripAddonLabel(addon: AddonKey): string {
  return PRICING_ADDONS.find((a) => a.key === addon)?.label ?? addon
}

/** The plain breakdown of a loadout total, e.g. "$29 plan + $20 Resonance Engine", so a door whose
 *  recommended loadout adds a metered add-on shows WHERE the total comes from and never reads as a bare
 *  higher plan price. Returns null when there is nothing to break down: the flat Nonprofit plan, or a
 *  Business-only door with no add-on (the total already IS the $29 plan price). PURE. */
export function stripBreakdownLabel(p: PersonaLoadout): string | null {
  if (p.perSeat || p.addons.length === 0) return null
  const cat = pricingCatalog()
  const base = `${formatLoadoutCents(cat.business_base.month.foundingCents)} plan`
  const addonParts = p.addons.map((addon) => {
    const item = cat[addonItemKey(addon)]
    return `${formatLoadoutCents(item.month.foundingCents)} ${stripAddonLabel(addon)}`
  })
  return [base, ...addonParts].join(' + ')
}

/** Build one "by who you are" strip row from a persona loadout, computing its live monthly total from
 *  the CODE catalog. PURE. */
export function loadoutStripRow(p: PersonaLoadout): LoadoutStripRow {
  const total = computeLoadoutTotal(pricingCatalog(), p.addons, 'month', 1)
  return {
    id: p.slug,
    label: p.label,
    href: personaPath(p.slug),
    addons: [...p.addons],
    total,
    totalLabel: stripTotalLabel(p),
    breakdownLabel: stripBreakdownLabel(p),
    note: p.note,
    perSeat: !!p.perSeat,
  }
}

/** Every "by who you are" strip row, in plan order. PURE. */
export function loadoutStrip(): LoadoutStripRow[] {
  return PERSONA_LOADOUTS.map(loadoutStripRow)
}

// ── Mission framing + the answer-engine ladder summary ──────────────────────────────────────────────

/** The one mission-framing line (PRICING-LADDER-PLAN §1a). Plain, no guilt, skeptic-proof: it states
 *  what a paid plan funds, in concrete terms. No em dashes. */
export const MISSION_FRAMING =
  'Frequency is a community collective. We exist to support and create community. A paid plan keeps the collective independent and funds the people and infrastructure behind it, so a Space is funding the work, not just renting software.'

/** The Crew (personal tier) note for the pricing page, from the catalog/settings code defaults. Crew is
 *  the personal tier (list $12, founding $9); the commercial page notes it and links to the upgrade page. */
export const CREW_NOTE = {
  name: 'Crew',
  listLabel: '$12',
  foundingLabel: '$9',
  line: 'Crew is the personal tier for individuals, at $9 a month under a $12 list price. It lives on the personal upgrade page.',
  href: '/upgrade',
} as const

/** The pricing-table summary an answer engine can lift: a short, plain ladder of the three commercial
 *  tiers plus the add-ons and the take-rates, built from the same catalog the page renders. PURE. The
 *  llms.txt route prints these lines so the ladder is citable. */
export function pricingLadderSummary(): string[] {
  const tiers = pricingTiers()
  const lines: string[] = []
  for (const t of tiers) {
    const headline = tierHeadline(t, 'month')
    const anchor = tierListAnchor(t, 'month')
    const price = anchor ? `${headline} (list ${anchor})` : headline
    const soon = t.preview ? ' (coming soon)' : ''
    lines.push(`- ${t.name}${soon}: ${price}. For ${t.forWho.toLowerCase()} Fee: ${t.takeRate}.`)
  }
  for (const a of PRICING_ADDONS) {
    lines.push(`- ${a.label} add-on: ${proAddonPrice(a.key)}, optional on any paid plan.`)
  }
  lines.push(`- ${CREW_NOTE.name}: ${CREW_NOTE.foundingLabel}/mo, the personal tier (list ${CREW_NOTE.listLabel}).`)
  return lines
}
