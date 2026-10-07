// THE PRICING GRID — the pure model behind the public /pricing page: every ADVERTISED offering (the two
// MEMBER tiers and the four SPACE tiers: Free, Business, Collective, Non Profit) and the detailed feature
// comparison beneath them. The five-tier ladder (ADR-1709): Members join, Crew hosts, a Space runs,
// Business sells, Collective connects.
//
// ADVERTISED, not "every tier that exists": the Space columns come from spacePlanRows, which maps
// lib/pricing/display.ts ADVERTISED_SPACE_PLANS. Independent is a real, sellable tier that is NOT on
// that list (owner ruling 2026-09-08, LIVE-227) and so appears in no column here, no comparison cell,
// and no answer-engine line. Read the constant's doc before adding a tier back.
//
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE: no cell in the comparison is typed by hand. Every cell is
// DERIVED from the same code the product actually gates on, so the page cannot drift from what a plan
// really grants:
//
//   * an ENTITLEMENT row reads planEntitlementKeys(plan) — the tier depth key sets in
//     lib/pricing/plans.ts. Move a key between those sets and this grid moves with it.
//   * a GATE row reads meetsGate(FEATURE_GATES[feature]) — lib/pricing/gates.ts, the real minimum
//     entitlement each feature is gated on.
//   * a METER row reads the tier's rung on the feature's usage ladder — lib/pricing/feature-meters.ts,
//     the one map of per-tier allowances.
//   * the NETWORK FEE row reads take_rate.network_bps, the ACTUAL per-plan rate lib/billing/fees.ts
//     charges, but ONLY on a column that takes payments. Selling starts at Business (ADR-1709), so the
//     personal columns and the free Space read "tips only" instead of a rate: the free and personal
//     rungs survive in the vector as default-deny values, never as a price anyone is quoted.
//   * the SELLING row reads the `space_payments` gate through planTakesPayments
//     (lib/pricing/payments-gate.ts), the same plan check every money path asks, with the operator's
//     overrides merged in.
//   * the AI ADD-ON row reads ADDON_ENTITLEMENT_KEYS: the add-on keys are in no tier base, so the row
//     resolves to the metered price on every paid tier and to "not available" on Free. Fold those keys
//     into a tier base and the row flips to "Included" on its own.
//   * every PRICE reads the operator-editable pricing config (getPricingValues), through the shared
//     display helpers (memberTierRows / spacePlanRows / formatCents), so a price change at
//     /admin/pricing needs no deploy. Crew reads as "from $X/mo" because it is pay-what-you-want and the
//     configured amount is its floor.
//
// PURE + framework-independent (no React / Supabase / Next / Stripe), like the rest of lib/pricing/*, so
// the whole grid is unit-testable and the page is a renderer with no pricing logic of its own. The IO
// (getPricingValues) lives at the call site and is handed in.
//
// VOICE (docs/CONTENT-VOICE.md): plain sentences, no em dashes, nothing that narrates the reader's
// feelings, and no claim the config does not back. Labels come from the naming canon (docs/NAMING.md):
// Member, Crew, Space, Business, Collective, Non Profit.

import { BETA_CTA_HREF } from '@/lib/site'
import {
  catalogItem,
  networkTakeRateBpsForPlan,
  networkTakeRateFromStored,
  type CatalogItemKey,
} from '@/lib/billing/pricing-keys'
import { ENTITLEMENT_LABEL, type EntitlementTier } from '@/lib/core/entitlement'
import type { ResolvedCatalogItem } from './catalog-config'
import {
  ADVERTISED_SPACE_PLANS,
  annualDiscountNote,
  formatBps,
  formatCents,
  memberTierRows,
  spacePlanRows,
  trialNote,
  type PriceRow,
} from './display'
import { allowanceLabel, currentMeterStepIndex, featureMeter } from './feature-meters'
import { isBetaPricingActive } from './beta'
import { meetsGate, mergeGate, type FeatureGateOverrides, type GateAxis } from './gates'
import { planTakesPayments } from './payments-plan'
import {
  ADDON_ENTITLEMENT_KEYS,
  SPACE_PLAN_LABEL,
  planEntitlementKeys,
  type AddonKey,
  type SpacePlan,
} from './plans'
import type { PricingDefaults } from './settings'

// ── The inputs (all operator-editable config, resolved by the caller) ────────────────────────────────

/** Everything the grid needs, resolved by the caller from the operator-editable config. Handed in so
 *  this module stays pure: `values` is getPricingValues() (the pricing_settings layer, which carries the
 *  plan/tier prices, the trial, the annual discount, and the take-rates) and `catalog` is the resolved
 *  catalog config (which carries the metered add-on and the operator-seat amounts). */
export interface PricingGridInput {
  values: PricingDefaults
  /** The resolved catalog items, keyed (catalogConfigByKey(loadCatalogConfig())). */
  catalog: Record<CatalogItemKey, ResolvedCatalogItem>
  /** Is the Opening Beta pricing window still open (isBetaPricingActive())? The page passes the SAME
   *  answer the checkout asks, so the table can never quote a rate the checkout has stopped charging
   *  (ADR-880). Omitted = the live clock, which is still the honest answer; it is a parameter so the
   *  grid stays pure and both sides of the cutover are testable. */
  betaActive?: boolean
  /** The operator's feature-gate overrides (loadFeatureGateOverrides()), merged over the code map the
   *  way featureAllowed does. Omitted = the code map alone. Threading them in is what keeps a gate an
   *  operator RAISED from still reading "Included" on /pricing (ADR-880); resolving them here would
   *  make this module server-only, so the page resolves and hands them down. */
  gateOverrides?: FeatureGateOverrides
}

/** The beta-window answer for an input: explicit when the caller resolved it, else the live clock (the
 *  same call the checkout makes). PURE-ish by construction: every consumer takes it from here. */
function betaActiveFor(input: PricingGridInput): boolean {
  return input.betaActive ?? isBetaPricingActive()
}

// ── Offerings: the six advertised columns, each fully priced ─────────────────────────────────────────

/** One sellable offering: a member tier or a Space tier, with everything a buyer needs to decide.
 *  `axis` + `tier` are what the comparison grid resolves its cells against, so a column and its grid
 *  cells can never describe different tiers. */
export interface Offering {
  /** Stable id (also the grid column id): 'member' | 'crew' | 'free' | 'business' | ... */
  id: string
  /** Which ladder this offering sits on: the personal membership tier, or the Space plan. */
  axis: GateAxis
  /** The tier label on that ladder ('free' | 'crew', or a SpacePlan). */
  tier: string
  /** The naming-canon label (Member, Crew, Free, Business, Collective, Non Profit). */
  label: string
  /** What this offering is, in a few words. */
  tagline: string
  /** One plain sentence on who it is for. */
  forWho: string
  /** The monthly price label ("Free", "$19/mo", or "from $4.99/mo" for pay-what-you-want Crew). */
  monthly: string
  /** The raw monthly cents behind that label (0 for a free tier), for callers that must compute: the
   *  JSON-LD Offer amount is the same number the page prints, never a second source. */
  monthlyCents: number
  /** The yearly price label ("$190/yr"), or null when there is no yearly price (free tiers). */
  yearly: string | null
  /** The crossed-out monthly LIST anchor ("$29") when this offering is sold at a lower beta rate, else
   *  null. Derived from the config (an anchor reads only when list_cents is above monthly_cents), so no
   *  tier can claim a discount the operator has not set. */
  listAnchor: string | null
  /** The honest beta line, present only where an anchor is. Null otherwise. */
  betaNote: string | null
  /** The trial line, present only where a trial applies (paid Space plans). Null otherwise. */
  trial: string | null
  /** The billing line (how it is billed, including the yearly deal). */
  billing: string
  /** The network take-rate line for this offering. */
  takeRate: string
  /** The NUMBER behind that line: the network-sourced take-rate for this offering, in basis points.
   *  Carried alongside the sentence so a caller that needs the bare rate (an answer-engine line, a
   *  comparison, a JSON-LD field) reads it instead of parsing the prose back apart. */
  networkRateBps: number
  /** Can this offering take payments (paid tickets, memberships, donations, shop checkout, booking
   *  deposits)? False on Member, Crew and the free Space, which take tips only (ADR-1709). Read off the
   *  payments gate, so the page's selling line and the gate the checkout asks cannot disagree. */
  sells: boolean
  /** True for the ONE recommended card on the page: Business, where selling opens. One crown, not a
   *  pair: a pricing page that recommends two plans recommends neither (LIVE-759). The page float and
   *  the comparison emphasis both read THIS flag. */
  featured: boolean
  cta: { label: string; href: string }
}

/** The member Spaces a Collective includes before the extra-Space add-on (ADR-1709, the
 *  `collective_space` catalog item). A quantity, not a price, and the one place the copy reads it. */
const COLLECTIVE_INCLUDED_SPACES = 5

/** The plain who-it-is-for + tagline copy per offering. Copy only, never a number: every figure on an
 *  offering is read from the config below. */
const OFFERING_COPY: Record<string, { tagline: string; forWho: string }> = {
  member: {
    tagline: 'Join everything, free.',
    forWho:
      'Anyone who wants to find their people, go to things, and join Circles. You can host a Circle and a couple of free Events of your own, and take tips.',
  },
  crew: {
    // Crew is contribute what you want (ADR-1084), and that has to be SAID, not implied by a "from" in
    // front of a number. An answer engine lifting this line otherwise reports the floor as the price.
    tagline: 'Back the community, host a little more.',
    forWho:
      'Members who want to support Frequency and host more on their own: more Circles, Events and Journeys, and a monthly Boost. You contribute what you want, and every amount buys the same Crew.',
  },
  free: {
    tagline: 'Host free. The whole thing.',
    forWho:
      'Anyone opening a Space, for as long as they want. Every business tool, with limits sized for a launch, and tips with no fee. No card, no clock.',
  },
  business: {
    tagline: 'Selling starts here.',
    forWho:
      'Practitioners, teachers who work across studios, studio owners, and community leaders ready to charge: paid tickets, memberships, donations, a shop and booking deposits, with the limits lifted.',
  },
  collective: {
    tagline: 'Groups of groups.',
    forWho: `Networks, federations, and anyone running several Spaces together: ${COLLECTIVE_INCLUDED_SPACES} member Spaces under one account, each with the Business tools, and Vera AI included.`,
  },
  nonprofit: {
    tagline: 'Business tools, verified.',
    forWho:
      'Verified 501(c)(3) organizations: everything Business does, with donations built in and no network fee. A Non Profit Collective is there for a network of them.',
  },
}

/** The honest beta framing shown ONLY beside a real crossed-out anchor: the rate is locked for as long
 *  as the subscription is kept (lib/pricing/beta.ts grandfathering). No countdown, no urgency. */
export const BETA_RATE_NOTE = 'Beta rate. Yours for as long as you keep the plan.'

/** Build the price half of an offering from a display PriceRow (the shared priceRow shaping, which is
 *  also what decides whether a crossed-out anchor reads at all). */
function pricedOffering(
  row: PriceRow,
): Pick<Offering, 'monthly' | 'monthlyCents' | 'yearly' | 'listAnchor' | 'betaNote'> {
  return {
    monthly: row.monthlyCents > 0 ? `${row.monthly}/mo` : 'Free',
    monthlyCents: row.monthlyCents,
    yearly: row.annual != null && (row.annualCents ?? 0) > 0 ? `${row.annual}/yr` : null,
    listAnchor: row.list,
    betaNote: row.list ? BETA_RATE_NOTE : null,
  }
}

/** The fee line on a column that takes tips only. "0%" is the honest number: a tip carries no fee on
 *  any tier. */
const TIPS_ONLY_LINE = 'Tips only, at 0%'

/** The fee line on a column that sells: the promise first, then the introduction fee. */
function sellingRateLine(bps: number): string {
  return `0% on your own people, ${formatBps(bps)} once per customer the network introduces`
}

/** The two MEMBER offerings, in ladder order: Member (free) and Crew. PURE.
 *
 *  Members get no trial: the free tier IS the trial (space-plan-checkout only sets trial days on Space
 *  plans), so no member column claims one. */
export function memberOfferings(input: PricingGridInput): Offering[] {
  const { values } = input
  // THE SAME ROW /upgrade AND THE PRICE TABLES RENDER. memberTierRows is where the "from" prefix lives,
  // because Crew is pay-what-you-want and its configured amount is a floor. Building the row with a bare
  // priceRow() here is how this column came to quote "$4.99/mo" as though it were the price while the
  // tables beside it read "from $4.99" — one offer, two figures. One builder, one figure.
  const crew = memberTierRows(values)[0]!
  // NEITHER MEMBER COLUMN SELLS (ADR-1709). Personal selling is off on every personal tier; tips stay
  // open at 0%. The personal rungs (`member_free_bps`, `member_bps`) stay in the vector as default-deny
  // values only, so no column quotes them: the number a reader sees is the 0% a tip carries.
  return [
    {
      id: 'member',
      axis: 'tier',
      tier: 'free',
      label: ENTITLEMENT_LABEL.free,
      ...OFFERING_COPY.member!,
      monthly: 'Free',
      monthlyCents: 0,
      yearly: null,
      listAnchor: null,
      betaNote: null,
      trial: null,
      billing: 'Free forever. No card.',
      takeRate: TIPS_ONLY_LINE,
      networkRateBps: 0,
      sells: false,
      featured: false,
      // BETA_CTA_HREF is the one front door (now /join, the Funnels induction, ADR-1090).
      // History: this CTA once hardcoded '/join' when that was NOT a route and 404'd for
      // every visitor — the constant is the guard against a second drift.
      cta: { label: 'Join free', href: BETA_CTA_HREF },
    },
    {
      id: 'crew',
      axis: 'tier',
      tier: 'crew',
      label: crew.label,
      ...OFFERING_COPY.crew!,
      ...pricedOffering(crew),
      trial: null,
      billing: `Monthly or yearly. ${annualDiscountNote(values)}`,
      takeRate: TIPS_ONLY_LINE,
      networkRateBps: 0,
      sells: false,
      // One recommended card on the page, and it is Business (see the `featured` doc above).
      featured: false,
      cta: { label: 'Join Crew', href: '/upgrade' },
    },
  ]
}

/** The four ADVERTISED Space offerings, in ladder order: Free, Business, Collective, Non Profit. PURE.
 *
 *  A free Space is a real Space, available to anyone, and the whole product rather than a trial of it
 *  (docs/CORE-MODEL.md §1). The paid rungs are what a Space takes once money is moving through it. The paid
 *  rows come from spacePlanRows (the shared display shaping over the operator-set plan prices), which
 *  maps ADVERTISED_SPACE_PLANS, so the crossed-out anchor appears exactly where the config carries one
 *  and a tier the owner has taken off the public ladder cannot reappear here. */
export function spaceOfferings(input: PricingGridInput): Offering[] {
  const { values } = input
  // BETA AUTO-REVERT (ADR-880): the ladder is shaped through the beta window, so on the cutover the
  // list price becomes the price, the strike disappears, and the beta note goes with it. Before that,
  // the beta rate reads under its anchor exactly as it does today.
  const paid = spacePlanRows(values, betaActiveFor(input))
  const trial = trialNote(values)
  // The plan finds its RUNG through the one resolver (LIVE-230); nothing here indexes the vector by name.
  const ladder = networkTakeRateFromStored(values.take_rate)
  const rateBps = (plan: SpacePlan): number => networkTakeRateBpsForPlan(plan, ladder)
  const sells = (plan: SpacePlan): boolean => planTakesPayments(plan, input.gateOverrides)
  const rate = (plan: SpacePlan): string => (sells(plan) ? sellingRateLine(rateBps(plan)) : TIPS_ONLY_LINE)

  const free: Offering = {
    id: 'free',
    axis: 'plan',
    tier: 'free',
    label: SPACE_PLAN_LABEL.free,
    ...OFFERING_COPY.free!,
    monthly: 'Free',
    monthlyCents: 0,
    yearly: null,
    listAnchor: null,
    betaNote: null,
    trial: null,
    billing: 'Free forever. No card.',
    takeRate: rate('free'),
    networkRateBps: sells('free') ? rateBps('free') : 0,
    sells: sells('free'),
    featured: false,
    cta: { label: 'Start a free Space', href: '/spaces' },
  }

  return [
    free,
    ...paid.map((row): Offering => {
      const plan = row.key as SpacePlan
      return {
        id: plan,
        axis: 'plan',
        tier: plan,
        label: row.label,
        ...(OFFERING_COPY[plan] ?? { tagline: row.label, forWho: '' }),
        ...pricedOffering(row),
        trial,
        billing: `Monthly or yearly. ${annualDiscountNote(values)}`,
        takeRate: rate(plan),
        networkRateBps: sells(plan) ? rateBps(plan) : 0,
        sells: sells(plan),
        // The page's one recommended card (see the `featured` doc above): Business, where selling opens.
        featured: plan === 'business',
        cta: {
          label: plan === 'nonprofit' ? 'Get verified' : plan === 'collective' ? 'Start a Collective' : 'Start with Business',
          href: '/spaces',
        },
      }
    }),
  ]
}

/** Every sellable offering, member ladder then Space ladder. PURE. */
export function allOfferings(input: PricingGridInput): Offering[] {
  return [...memberOfferings(input), ...spaceOfferings(input)]
}

// ── The comparison grid: rows DERIVED from the key sets, gates, meters, and config ───────────────────

/** How a cell reads: a plain yes, a plain no, or a value (an allowance, a price, a rate). */
type GridCellKind = 'yes' | 'no' | 'value'

/** One resolved cell, aligned by index to the grid's columns. */
interface GridCell {
  kind: GridCellKind
  /** What the cell reads. Always a full phrase, so a screen reader row makes sense on its own. */
  text: string
}

/** One comparison row: what the capability is, and its cell per column. */
interface GridRow {
  key: string
  label: string
  /** One plain line on what the capability actually is. */
  detail: string
  cells: GridCell[]
}

/** A named group of rows (the section a reader scans by). */
interface GridGroup {
  key: string
  label: string
  rows: GridRow[]
}

/** One column of a comparison grid: the offering it describes, reduced to what a cell resolves against. */
interface GridColumn {
  id: string
  label: string
  axis: GateAxis
  tier: string
}

/** A whole comparison grid: its columns and its grouped rows. */
export interface FeatureGrid {
  columns: GridColumn[]
  groups: GridGroup[]
}

/** The row SOURCES: each names the code that decides the cell, never the cell itself. */
type RowSource =
  /** Reads planEntitlementKeys(plan): is this entitlement key in the tier's depth set? */
  | { from: 'entitlement'; key: string }
  /** Reads meetsGate(FEATURE_GATES[feature]): does the tier clear the feature's real minimum? */
  | { from: 'gate'; feature: string }
  /** Reads the tier's rung on the feature's usage-meter ladder (the per-tier allowance). */
  | { from: 'meter'; feature: string }
  /** Reads take_rate.network_bps: the rate charged on business the network sources. */
  | { from: 'takeRate' }
  /** Reads the payments gate: can this column take payments at all? */
  | { from: 'payments' }
  /** Reads ADDON_ENTITLEMENT_KEYS + the catalog amount: the metered add-on's availability and price. */
  | { from: 'addon'; addon: AddonKey }
  /** Reads the operator-seat catalog item: extra team seats, on the tiers whose depth includes `team`. */
  | { from: 'seats' }
  /** Reads trial.days: the free trial, on the tiers that are sold. */
  | { from: 'trial' }
  /** A capability that is on for every column on this ladder (the free core). One declaration, not a
   *  hand-typed cell per column. */
  | { from: 'always'; text?: string }

interface RowDef {
  key: string
  label: string
  detail: string
  source: RowSource
}

interface GroupDef {
  key: string
  label: string
  rows: RowDef[]
}

const YES: GridCell = { kind: 'yes', text: 'Included' }
const NO: GridCell = { kind: 'no', text: 'Not included' }

/** Resolve an ENTITLEMENT cell straight from the tier depth key sets (lib/pricing/plans.ts). PURE. */
function entitlementCell(key: string, column: GridColumn): GridCell {
  if (column.axis !== 'plan') return NO
  return planEntitlementKeys(column.tier as SpacePlan).includes(key) ? YES : NO
}

/** Resolve a GATE cell from the real feature gate (lib/pricing/gates.ts), the CODE map with the
 *  operator's overrides merged over it: exactly what featureAllowed resolves at enforcement time, and
 *  what ADR-875's beta-notice targetForGate already reads. Reading FEATURE_GATES alone (the bug ADR-880
 *  fixes) meant an operator who raised `space_crm` to Collective left /pricing still promising
 *  "Included" on Business. A feature with no gate entry and no override is ungated, which reads as
 *  included (matching featureAllowed's default-allow for an undeclared key). */
function gateCell(feature: string, column: GridColumn, overrides: FeatureGateOverrides): GridCell {
  const gate = mergeGate(feature, overrides)
  if (!gate) return YES
  const account = column.axis === 'plan' ? { plan: column.tier as SpacePlan } : { tier: column.tier as EntitlementTier }
  return meetsGate(gate, account) ? YES : NO
}

/** Resolve a METER cell: the tier's rung on the feature's usage ladder, as its plain allowance line
 *  (lib/pricing/feature-meters.ts, the one map of quantities). A tier above the top rung reads the top
 *  rung, which is exactly how the enforcement seam resolves it. */
function meterCell(feature: string, column: GridColumn): GridCell {
  const ladder = featureMeter(feature)
  if (!ladder) return NO
  const step = ladder.steps[currentMeterStepIndex(ladder, column.tier)]
  if (!step) return NO
  if (step.allowance === 0) return { kind: 'no', text: allowanceLabel(0, ladder.unit, ladder.period) }
  return { kind: 'value', text: step.allowanceText }
}

/** Is this column a PAID tier? Derived, never listed: a paid Space tier is one whose depth set grants
 *  something, and a paid member tier is anything above the free floor. */
function isPaidColumn(column: GridColumn): boolean {
  if (column.axis === 'plan') return planEntitlementKeys(column.tier as SpacePlan).length > 0
  return column.tier !== 'free'
}

/** Resolve the metered ADD-ON cell from ADDON_ENTITLEMENT_KEYS. The add-on keys sit in no tier base, so
 *  every paid tier reads the metered price and Free reads "not available". If those keys are ever folded
 *  into a tier's depth set, that tier's cell flips to Included with no edit here. */
function addonCell(addon: AddonKey, column: GridColumn, input: PricingGridInput): GridCell {
  const keys = ADDON_ENTITLEMENT_KEYS[addon]
  if (column.axis === 'plan') {
    const held = planEntitlementKeys(column.tier as SpacePlan)
    if (keys.every((k) => held.includes(k))) return YES
  }
  if (!isPaidColumn(column)) return { kind: 'no', text: 'Not sold on the free plan' }
  const item = input.catalog[`addon_${addon}` as CatalogItemKey]
  if (!item) return { kind: 'no', text: 'Not sold yet' }
  return { kind: 'value', text: `Add-on, ${formatCents(item.month.foundingCents)}/mo` }
}

/** Resolve the extra-operator-seats cell. Seats ride the tiers whose depth includes the `team` key
 *  (ADR-799); the per-seat amount comes from the operator-seat catalog item. LIVE-229 cleared the
 *  placeholder, so a missing catalog row is the only remaining "owner-priced" path. */
function seatsCell(column: GridColumn, input: PricingGridInput): GridCell {
  if (column.axis !== 'plan') return { kind: 'no', text: 'Not part of a member plan' }
  if (!planEntitlementKeys(column.tier as SpacePlan).includes('team')) {
    return { kind: 'no', text: 'Not on this plan' }
  }
  const item = input.catalog.operator_seat
  if (!item || catalogItem('operator_seat').placeholder) {
    return { kind: 'value', text: 'Add seats, owner-priced' }
  }
  return { kind: 'value', text: `${formatCents(item.month.foundingCents)}/seat/mo` }
}

/** Resolve one cell for one row + column. THE single place a cell is decided. PURE. */
function resolveCell(source: RowSource, column: GridColumn, input: PricingGridInput): GridCell {
  switch (source.from) {
    case 'entitlement':
      return entitlementCell(source.key, column)
    case 'gate':
      return gateCell(source.feature, column, input.gateOverrides ?? {})
    case 'meter':
      return meterCell(source.feature, column)
    case 'takeRate': {
      // Only a column that takes payments has a network fee. Personal columns and the free Space take
      // tips only, which carry no fee on any tier (ADR-1709).
      if (column.axis !== 'plan' || !planTakesPayments(column.tier as SpacePlan, input.gateOverrides)) {
        return { kind: 'value', text: TIPS_ONLY_LINE }
      }
      return {
        kind: 'value',
        text: formatBps(networkTakeRateBpsForPlan(column.tier, networkTakeRateFromStored(input.values.take_rate))),
      }
    }
    case 'payments': {
      if (column.axis !== 'plan') return { kind: 'no', text: 'Tips only' }
      return planTakesPayments(column.tier as SpacePlan, input.gateOverrides)
        ? YES
        : { kind: 'no', text: 'Tips only' }
    }
    case 'addon':
      return addonCell(source.addon, column, input)
    case 'seats':
      return seatsCell(column, input)
    case 'trial': {
      const note = trialNote(input.values)
      if (!isPaidColumn(column) || column.axis !== 'plan') return { kind: 'value', text: 'No card, no clock' }
      return note ? { kind: 'value', text: note.replace(/\.$/, '') } : NO
    }
    case 'always':
      return { kind: 'yes', text: source.text ?? YES.text }
  }
}

// ── The SPACE comparison: the row groups, each row naming the code that decides it ───────────────────

const SPACE_GROUPS: GroupDef[] = [
  {
    key: 'community',
    label: 'Community and profile',
    rows: [
      {
        key: 'profile',
        label: 'Your Space, page, and members',
        detail: 'Your public page, your posts, your calendar, and a place for your people to gather.',
        source: { from: 'always' },
      },
      {
        key: 'events',
        label: 'Events and calendar',
        detail: 'Create events, publish your calendar, and share a subscribe link.',
        source: { from: 'always' },
      },
      {
        key: 'space_circles',
        label: 'Circles',
        detail: 'Circles your Space runs, the Space Circle included.',
        source: { from: 'meter', feature: 'space_circles' },
      },
      {
        key: 'space_events',
        label: 'Upcoming Events',
        detail: 'Events on your calendar that have not happened yet.',
        source: { from: 'meter', feature: 'space_events' },
      },
      {
        key: 'space_qr',
        label: 'Editable QR codes',
        // Owner ruling 2026-10-06: every Space gets its stock QR code to download; editable codes
        // (change where they point after printing) are the metered part.
        detail: 'Every Space gets its own QR code to download. Editable codes can change where they point after you print them.',
        source: { from: 'meter', feature: 'space_qr' },
      },
      {
        key: 'reviews',
        label: 'Reviews and ratings',
        detail: 'The member rating and review wall on your page.',
        source: { from: 'always' },
      },
    ],
  },
  {
    key: 'crm',
    label: 'Contacts and CRM',
    rows: [
      {
        key: 'crm',
        label: 'The full CRM',
        detail: 'The pipeline, contact records, and private notes for your Space.',
        source: { from: 'entitlement', key: 'crm' },
      },
      {
        key: 'space_crm',
        label: 'Contacts',
        detail: 'How many people you can hold in the CRM.',
        source: { from: 'meter', feature: 'space_crm' },
      },
      {
        key: 'crm.playbooks',
        label: 'Governed playbooks',
        detail: 'Repeatable follow-up sequences with a human in the loop.',
        source: { from: 'entitlement', key: 'crm.playbooks' },
      },
      // Multiple pipelines sat here and are off the page by owner ruling (2026-10-06): they come back
      // when the feature is built. The meter stays in feature-meters for the product itself.
      {
        key: 'reporting',
        label: 'Reporting and exports',
        detail: 'Your numbers, and your contacts exportable any time.',
        source: { from: 'entitlement', key: 'reporting' },
      },
    ],
  },
  {
    key: 'comms',
    label: 'Comms',
    rows: [
      {
        key: 'space_campaigns_month',
        label: 'Email campaigns',
        detail: 'Write a campaign, pick who gets it, and send or schedule it. Free campaigns carry a Frequency footer.',
        source: { from: 'meter', feature: 'space_campaigns_month' },
      },
      {
        key: 'space_email',
        label: 'Email sends',
        detail: 'How much you can send each month.',
        source: { from: 'meter', feature: 'space_email' },
      },
      {
        key: 'space_automations_active',
        label: 'Active automations',
        detail: 'Follow-up that runs on its own once you set it.',
        source: { from: 'meter', feature: 'space_automations_active' },
      },
      {
        key: 'space_automation',
        label: 'Automation runs',
        detail: 'How many automated steps run for you each month.',
        source: { from: 'meter', feature: 'space_automation' },
      },
    ],
  },
  {
    key: 'money',
    label: 'Money and commerce',
    rows: [
      {
        key: 'payments',
        label: 'Take payments',
        // THE SELLING LINE (ADR-1709): paid tickets, paid memberships, donations, shop checkout and
        // booking deposits all ask one gate (`space_payments`, lib/pricing/payments-gate.ts). Read off
        // it, so the table and the checkout agree.
        detail: 'Paid tickets, paid memberships, donations, shop checkout and booking deposits. Tips are open on every plan.',
        source: { from: 'payments' },
      },
      {
        key: 'tips',
        label: 'Tips',
        detail: 'Anyone can leave a tip, on every plan, and we take nothing from it.',
        source: { from: 'always', text: 'Included, 0%' },
      },
      {
        key: 'space_shop_listings',
        label: 'Shop listings',
        detail: 'Products on your page. On a free Space they take inquiries; checkout opens with selling.',
        source: { from: 'meter', feature: 'space_shop_listings' },
      },
      {
        key: 'space_storefront',
        // ADR-1709 (LIVE-753): the gate is shop CHECKOUT at Business, a channel floor checked beside
        // space_payments. Its own row so an operator who raises it sees the cell move. A free Space still
        // lists, inquiries only (the shop listings row above).
        label: 'Shop checkout',
        detail: 'Take orders and payment for your listings from your page.',
        source: { from: 'gate', feature: 'space_storefront' },
      },
      {
        key: 'space_services',
        label: 'Bookable services',
        detail: 'The services people can book with you.',
        source: { from: 'meter', feature: 'space_services' },
      },
      {
        key: 'space_bookings',
        label: 'Bookings',
        detail: 'Bookings people make with you each month.',
        source: { from: 'meter', feature: 'space_bookings' },
      },
      {
        key: 'space_membership_tiers',
        label: 'Membership tiers',
        // The tier COUNT. Charging for a tier is the paid memberships row below; a free Space's tier is
        // free to join.
        detail: 'Your own membership tiers. On a free Space a tier is free to join.',
        source: { from: 'meter', feature: 'space_membership_tiers' },
      },
      {
        key: 'space_memberships',
        label: 'Paid memberships',
        detail: 'Membership tiers people pay for, and the members on them.',
        // A GATE, not a meter. ADR-1709 (LIVE-753) put PAID memberships at Business, a channel floor
        // checked beside space_payments; a free Space keeps one free-to-join tier (the row above). The
        // `space_memberships` METER that used to back this row was deleted because capping active members
        // punishes a Space for growing. Checkout still refuses when Connect is not payout-ready.
        source: { from: 'gate', feature: 'space_memberships' },
      },
      {
        key: 'space_membership_tickets',
        label: 'Members-only ticket tiers',
        detail: 'Restrict a ticket tier to your own members.',
        source: { from: 'gate', feature: 'space_membership_tickets' },
      },
      {
        key: 'take_rate',
        label: 'Network fee',
        detail:
          'Charged once, on a customer the network introduced, at their first purchase. You keep 100% of the business you bring in yourself, and 0% applies for good to anyone already in your world: a follower, one of your members, a contact, or someone who bought before.',
        source: { from: 'takeRate' },
      },
    ],
  },
  {
    key: 'site',
    label: 'Your site',
    rows: [
      {
        key: 'space_full_website',
        label: 'Multi-page website',
        detail: 'More than one page: your own site, run from your Space.',
        source: { from: 'entitlement', key: 'space_full_website' },
      },
      // A `whitelabel` row sat here, and it went with the tier (owner ruling 2026-09-08, LIVE-227).
      // `whitelabel` is granted by the Independent depth set alone, so with Independent off the
      // advertised ladder the row resolved to "Not included" in every single column: not a comparison,
      // just a description of the one product this page must not be selling, since the standalone site
      // it promises still renders "Coming soon". The row comes back when the ladder does. The group
      // label lost "and branding" with it rather than heading a section that no longer covers any.
    ],
  },
  {
    key: 'team',
    label: 'Team and collaboration',
    rows: [
      {
        key: 'team',
        label: 'Team roles',
        detail: 'Bring people in as editors, moderators, and admins.',
        source: { from: 'entitlement', key: 'team' },
      },
      {
        key: 'space_team',
        label: 'Operator seats included',
        detail: 'The seats that come with the plan. The owner always has one.',
        source: { from: 'meter', feature: 'space_team' },
      },
      {
        key: 'seats',
        label: 'Extra operator seats',
        detail: 'Add seats when the team grows past what the plan includes.',
        source: { from: 'seats' },
      },
      {
        key: 'space_collaborators',
        label: 'Host Collaborator Spaces',
        detail: 'Host other businesses inside your Space and on your events. Being a Collaborator is free for any Space.',
        source: { from: 'gate', feature: 'space_collaborators' },
      },
    ],
  },
  {
    key: 'ai',
    label: 'AI',
    rows: [
      {
        key: 'space_vera',
        label: 'Vera messages',
        detail: 'The assistant that answers questions about your Space.',
        source: { from: 'meter', feature: 'space_vera' },
      },
      {
        key: 'addon_ai',
        label: 'Vera AI add-on',
        detail: "Turns your community's signals into live matches and next-best actions. Metered, and you can turn it on or off any time.",
        source: { from: 'addon', addon: 'ai' },
      },
      {
        key: 'space_crm_resonance_ai',
        label: 'Resonance matches',
        detail: 'How many matches the AI add-on surfaces for you each month.',
        source: { from: 'meter', feature: 'space_crm_resonance_ai' },
      },
    ],
  },
  {
    key: 'programs',
    label: 'Programs and Journeys',
    rows: [
      {
        key: 'program',
        label: 'Run a Program',
        detail: 'Your model becomes a blueprint, and members start Chapters anywhere.',
        source: { from: 'entitlement', key: 'program' },
      },
      {
        key: 'space_journey_publish',
        label: 'Published Journeys',
        detail: 'Multi-week programs built from your practices.',
        source: { from: 'meter', feature: 'space_journey_publish' },
      },
      {
        key: 'space_journey',
        label: 'Journey enrollees',
        detail: 'How many people can be working through your Journeys at once.',
        source: { from: 'meter', feature: 'space_journey' },
      },
    ],
  },
  {
    key: 'support',
    label: 'Getting started and support',
    rows: [
      {
        key: 'trial',
        label: 'Free trial',
        detail: 'Try the plan before it bills.',
        source: { from: 'trial' },
      },
      {
        key: 'export',
        label: 'Export your data',
        detail: 'Your contacts and your data are yours, exportable any time, on every plan.',
        source: { from: 'always' },
      },
      {
        key: 'support',
        label: 'Help center and support',
        detail: 'The help center and a real person to write to, on every plan.',
        source: { from: 'always' },
      },
    ],
  },
]

// ── The MEMBER comparison ────────────────────────────────────────────────────────────────────────────

const MEMBER_GROUPS: GroupDef[] = [
  {
    key: 'community',
    label: 'Community',
    rows: [
      {
        key: 'join',
        label: 'Circles, events, and messaging',
        detail: 'Joining, belonging to Circles, going to events, following Spaces, and messaging. Always free.',
        source: { from: 'always' },
      },
      {
        key: 'space',
        label: 'A Space of your own',
        detail: 'A free Space is open to anyone. Crew is not required to run one.',
        source: { from: 'always' },
      },
    ],
  },
  {
    key: 'hosting',
    label: 'Hosting on your own',
    rows: [
      {
        key: 'circle_host',
        label: 'Circles you host',
        detail: 'Circles you start and look after as a person, without a Space.',
        source: { from: 'meter', feature: 'circle_host' },
      },
      {
        key: 'event_create',
        label: 'Upcoming Events',
        detail: 'Free Events you host on your own, while they are upcoming.',
        source: { from: 'meter', feature: 'event_create' },
      },
      {
        key: 'event_guests',
        label: 'Guests per Event',
        detail: 'How many people can RSVP to one of your Events.',
        source: { from: 'meter', feature: 'event_guests' },
      },
    ],
  },
  {
    key: 'programs',
    label: 'Practices and Journeys',
    rows: [
      {
        key: 'practice_publish',
        label: 'Published Practices',
        detail: 'Practices you write and share with the community.',
        source: { from: 'meter', feature: 'practice_publish' },
      },
      {
        key: 'journey_publish',
        label: 'Published Journeys',
        detail: 'Multi-week programs you build and publish yourself.',
        source: { from: 'meter', feature: 'journey_publish' },
      },
      {
        key: 'journey_enrollees',
        label: 'Journey enrollees',
        detail: 'How many people can be working through your Journeys at once.',
        source: { from: 'meter', feature: 'journey_enrollees' },
      },
    ],
  },
  // 🔴 THE 'rewards' GROUP USED TO SIT HERE and is deliberately gone (ADR-1295, owner ruling
  // 2026-09-09, OWN-071). Its two rows were sourced `{ from: 'gate' }` on `gamification_full` and
  // `vault_cash_in`, and both gates were deleted: the Quest is a side thing we all do together, so
  // earning, spending and competing are open to every signed-in member. With the gates gone the
  // rows would have read "Included" in every column, which is a comparison table describing a
  // distinction that no longer exists. Removed rather than left true-but-empty.
  {
    key: 'ai',
    label: 'AI',
    rows: [
      {
        key: 'vera_unlimited',
        label: 'Vera messages',
        detail: 'The assistant that helps you find people, places, and things to do.',
        source: { from: 'meter', feature: 'vera_unlimited' },
      },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    rows: [
      {
        key: 'tips',
        label: 'Tips',
        detail: 'People can tip you for what you host, and we take nothing from it. Add a payout account once.',
        source: { from: 'always', text: 'Included, 0%' },
      },
      {
        key: 'payments',
        label: 'Take payments',
        // Personal selling is off on every personal tier (ADR-1709). Selling runs through a Space on
        // Business, which any member can open.
        detail: 'Paid tickets and sales run through a Space on Business. Any member can open a Space.',
        source: { from: 'payments' },
      },
    ],
  },
]

// ── Building the grids ───────────────────────────────────────────────────────────────────────────────

/** Turn an offering into the column a cell resolves against. PURE. */
function offeringColumn(offering: Offering): GridColumn {
  return { id: offering.id, label: offering.label, axis: offering.axis, tier: offering.tier }
}

/** Build a grid: resolve every group's rows against every column. PURE. */
function buildGrid(groups: GroupDef[], columns: GridColumn[], input: PricingGridInput): FeatureGrid {
  return {
    columns,
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      rows: group.rows.map((row) => ({
        key: row.key,
        label: row.label,
        detail: row.detail,
        cells: columns.map((column) => resolveCell(row.source, column, input)),
      })),
    })),
  }
}

/** The SPACE comparison grid: four columns (Free, Business, Collective, Non Profit) and every row
 *  derived from the tier depth key sets, the gates, the meters, and the pricing config. PURE. The
 *  columns ARE the offerings, so the grid gains and loses a column with the advertised ladder. */
export function spaceFeatureGrid(input: PricingGridInput): FeatureGrid {
  return buildGrid(SPACE_GROUPS, spaceOfferings(input).map(offeringColumn), input)
}

/** The MEMBER comparison grid: two columns (Member, Crew), derived the same way on the personal
 *  entitlement ladder. PURE. */
export function memberFeatureGrid(input: PricingGridInput): FeatureGrid {
  return buildGrid(MEMBER_GROUPS, memberOfferings(input).map(offeringColumn), input)
}

// ── Seats + the AI add-on, stated once, priced from config ───────────────────────────────────────────

/** One purchasable extra that rides a plan rather than being one: the AI add-on and team seats. Both are
 *  also rows in the grid, so the difference between tiers stays visible in the comparison. */
export interface PlanExtra {
  key: string
  label: string
  /** The price line, read from the catalog config. */
  price: string
  /** Who can buy it, derived from the tier depth key sets. */
  availability: string
  /** One plain line on what it is. */
  detail: string
}

/** The purchasable extras, priced from the operator-editable catalog. PURE.
 *
 *  The AI add-on's availability is derived: its entitlement keys are in no tier base, so it reads as an
 *  add-on on every paid tier. Seats derive from which tiers carry the `team` depth key. */
export function planExtras(input: PricingGridInput): PlanExtra[] {
  const ai = input.catalog.addon_ai
  const seat = input.catalog.operator_seat
  const seatPlaceholder = catalogItem('operator_seat').placeholder === true
  // 🔴 NAMED OVER THE ADVERTISED LADDER, NOT SPACE_PLANS. These two sentences print plan names to a
  // visitor, so they are a public mention of every tier they list. Reading SPACE_PLANS here is how the
  // add-on card went on saying "Optional on every paid Space plan: Business, Collective, Non Profit,
  // and Independent" while the ladder above it had stopped showing Independent at all.
  const teamTiers = ADVERTISED_SPACE_PLANS.filter((p) => planEntitlementKeys(p).includes('team')).map(
    (p) => SPACE_PLAN_LABEL[p],
  )
  const paidTiers = ADVERTISED_SPACE_PLANS.filter((p) => planEntitlementKeys(p).length > 0).map(
    (p) => SPACE_PLAN_LABEL[p],
  )

  return [
    {
      key: 'ai',
      label: 'Vera AI',
      price: ai
        ? `${formatCents(ai.month.foundingCents)}/mo, or ${formatCents(ai.year.foundingCents)}/yr`
        : 'Not sold yet',
      availability: `Optional on every paid Space plan: ${listPhrase(paidTiers)}.`,
      detail:
        "Metered AI that turns your community's signals into live matches and next-best actions. Turn it on or off any time.",
    },
    {
      key: 'seats',
      label: 'Operator seats',
      price:
        seat && !seatPlaceholder ? `${formatCents(seat.month.foundingCents)}/seat/mo` : 'Owner-priced today',
      availability: `Available on the plans that include team roles: ${listPhrase(teamTiers)}.`,
      detail:
        'Your own seat is included on every plan. Extra seats are for the editors, moderators, and admins who run the Space with you.',
    },
  ]
}

/** Join labels into a plain English list ("Business, Collective, and Non Profit"). PURE. */
function listPhrase(items: readonly string[]): string {
  if (items.length === 0) return 'none yet'
  if (items.length === 1) return items[0]!
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
