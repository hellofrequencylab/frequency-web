// THE PRICING GRID — the pure model behind the public /pricing page: every sellable offering (the two
// MEMBER tiers and the five SPACE tiers) and the detailed feature comparison beneath them.
//
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE: no cell in the comparison is typed by hand. Every cell is
// DERIVED from the same code the product actually gates on, so the page cannot drift from what a plan
// really grants:
//
//   * an ENTITLEMENT row reads planEntitlementKeys(plan) — the BUSINESS / COLLECTIVE / INDEPENDENT depth
//     key sets in lib/pricing/plans.ts. Move a key between those sets and this grid moves with it.
//   * a GATE row reads meetsGate(FEATURE_GATES[feature]) — lib/pricing/gates.ts, the real minimum
//     entitlement each feature is gated on.
//   * a METER row reads the tier's rung on the feature's usage ladder — lib/pricing/feature-meters.ts,
//     the one map of per-tier allowances.
//   * the TAKE-RATE row reads take_rate.network_bps, the ACTUAL per-tier rate lib/billing/fees.ts charges,
//     and on the PERSONAL ladder it first asks whether that tier can sell at all: a free Member takes
//     RSVPs and never a payment (ADR-913), so its cell reads "selling is not included" instead of a rate.
//   * the AI ADD-ON row reads ADDON_ENTITLEMENT_KEYS: the add-on keys are in no tier base, so the row
//     resolves to the metered price on every paid tier and to "not available" on Free. Fold those keys
//     into a tier base and the row flips to "Included" on its own.
//   * every PRICE reads the operator-editable pricing config (getPricingValues), through the shared
//     display helpers (priceRow / formatCents), so a price change at /admin/pricing needs no deploy.
//
// PURE + framework-independent (no React / Supabase / Next / Stripe), like the rest of lib/pricing/*, so
// the whole grid is unit-testable and the page is a renderer with no pricing logic of its own. The IO
// (getPricingValues) lives at the call site and is handed in.
//
// VOICE (docs/CONTENT-VOICE.md): plain sentences, no em dashes, nothing that narrates the reader's
// feelings, and no claim the config does not back. Labels come from the naming canon (docs/NAMING.md):
// Member, Crew, Space, Business, Collective, Non Profit, Independent.

import { catalogItem, type CatalogItemKey } from '@/lib/billing/pricing-keys'
import { ENTITLEMENT_LABEL, type EntitlementTier } from '@/lib/core/entitlement'
import type { ResolvedCatalogItem } from './catalog-config'
import {
  annualDiscountNote,
  formatBps,
  formatCents,
  priceRow,
  spacePlanRows,
  trialNote,
  type PriceRow,
} from './display'
import { allowanceLabel, currentMeterStepIndex, featureMeter } from './feature-meters'
import { isBetaPricingActive } from './beta'
import { meetsGate, mergeGate, type FeatureGateOverrides, type GateAxis } from './gates'
import {
  ADDON_ENTITLEMENT_KEYS,
  SPACE_PLANS,
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

// ── Offerings: the seven sellable columns, each fully priced ─────────────────────────────────────────

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
  /** The naming-canon label (Member, Crew, Free, Business, Collective, Non Profit, Independent). */
  label: string
  /** What this offering is, in a few words. */
  tagline: string
  /** One plain sentence on who it is for. */
  forWho: string
  /** The monthly price label ("Free", "$9/mo"). */
  monthly: string
  /** The raw monthly cents behind that label (0 for a free tier), for callers that must compute: the
   *  JSON-LD Offer amount is the same number the page prints, never a second source. */
  monthlyCents: number
  /** The yearly price label ("$90/yr"), or null when there is no yearly price (free tiers). */
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
  /** True for the one column the page highlights. */
  featured: boolean
  cta: { label: string; href: string }
}

/** The plain who-it-is-for + tagline copy per offering. Copy only, never a number: every figure on an
 *  offering is read from the config below. */
const OFFERING_COPY: Record<string, { tagline: string; forWho: string }> = {
  member: {
    tagline: 'Belong to everything.',
    forWho: 'Anyone who wants to find their people, go to things, and join Circles.',
  },
  crew: {
    tagline: 'The whole member experience.',
    forWho:
      'Members who want full access to member programs, and anyone selling tickets to their own events without running a Space.',
  },
  free: {
    tagline: 'Put your business on the map.',
    forWho: 'Anyone standing something up, for as long as they want. No card, no clock.',
  },
  business: {
    tagline: 'Own your audience.',
    forWho: 'Coaches, practitioners, studios, and product businesses running their own book of work.',
  },
  collective: {
    tagline: 'Be the venue.',
    forWho: 'Growing communities that run a team, automate their follow-up, and host other businesses.',
  },
  nonprofit: {
    tagline: 'The full toolkit, verified.',
    forWho: 'Verified 501(c)(3) organizations, with donations built in and no take-rate.',
  },
  independent: {
    tagline: 'Your own brand, standalone.',
    forWho: 'Organizations that want the whole platform under their own name and domain, off the network.',
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

/** Can an individual on this PERSONAL tier take a payment at all? Read from the real gate the product
 *  enforces (`event_paid_tickets`, which opens at Crew), with the operator's overrides merged the way
 *  featureAllowed merges them. A free Member creates events and takes RSVPs and never charges (ADR-913),
 *  so nothing on the page may quote that column a take-rate: there is no sale for a rate to apply to. */
function personalSellingAllowed(tier: string, overrides: FeatureGateOverrides = {}): boolean {
  const gate = mergeGate('event_paid_tickets', overrides)
  if (!gate) return true
  return meetsGate(gate, { tier: tier as EntitlementTier })
}

/** The line a column reads when its tier cannot sell: no rate, and what it CAN do instead. */
const NO_SELLING_LINE = 'Selling is not included. Events and RSVPs are free, and Crew turns on tickets and payments.'

/** The two MEMBER offerings, in ladder order: Member (free) and Crew. PURE.
 *
 *  Members get no trial: the free tier IS the trial (space-plan-checkout only sets trial days on Space
 *  plans), so no member column claims one. */
export function memberOfferings(input: PricingGridInput): Offering[] {
  const { values } = input
  const crew = priceRow('crew', ENTITLEMENT_LABEL.crew, values.tier.crew)
  // THE TWO MEMBER COLUMNS DO NOT SHARE A RATE (ADR-913). Crew is the paid personal SELLING tier and is
  // charged the member seller rate, `member_bps`, on network-sourced sales only. The free Member column
  // used to read the SAME string, which printed a take-rate under the FREE header for someone the product
  // does not let sell at all; it now reads the gate and says so.
  const crewRate = `0% on your own people, ${formatBps(values.take_rate.member_bps)} on network-sourced sales`
  const memberRate = personalSellingAllowed('free', input.gateOverrides) ? crewRate : NO_SELLING_LINE
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
      takeRate: memberRate,
      featured: false,
      cta: { label: 'Join free', href: '/join' },
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
      takeRate: crewRate,
      featured: false,
      cta: { label: 'Join Crew', href: '/upgrade' },
    },
  ]
}

/** The five SPACE offerings, in ladder order: Free, Business, Collective, Non Profit, Independent. PURE.
 *
 *  A free Space is a real Space, available to anyone; the paid tiers are the depth above it. The paid
 *  rows come from spacePlanRows (the shared display shaping over the operator-set plan prices), so the
 *  crossed-out anchor appears exactly where the config carries one. */
export function spaceOfferings(input: PricingGridInput): Offering[] {
  const { values } = input
  // BETA AUTO-REVERT (ADR-880): the ladder is shaped through the beta window, so on the cutover the
  // list price becomes the price, the strike disappears, and the beta note goes with it. Before that,
  // the beta rate reads under its anchor exactly as it does today.
  const paid = spacePlanRows(values, betaActiveFor(input))
  const trial = trialNote(values)
  const rate = (plan: SpacePlan): string =>
    `0% on your own bookings, ${formatBps(values.take_rate.network_bps[plan])} on network-sourced sales`

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
    featured: false,
    cta: { label: 'Start a Space', href: '/spaces' },
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
        featured: plan === 'business',
        cta: { label: plan === 'nonprofit' ? 'Get verified' : 'Start a Space', href: '/spaces' },
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
export type GridCellKind = 'yes' | 'no' | 'value'

/** One resolved cell, aligned by index to the grid's columns. */
export interface GridCell {
  kind: GridCellKind
  /** What the cell reads. Always a full phrase, so a screen reader row makes sense on its own. */
  text: string
}

/** One comparison row: what the capability is, and its cell per column. */
export interface GridRow {
  key: string
  label: string
  /** One plain line on what the capability actually is. */
  detail: string
  cells: GridCell[]
}

/** A named group of rows (the section a reader scans by). */
export interface GridGroup {
  key: string
  label: string
  rows: GridRow[]
}

/** One column of a comparison grid: the offering it describes, reduced to what a cell resolves against. */
export interface GridColumn {
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
 *  (ADR-799); the per-seat amount comes from the operator-seat catalog item, and while that item is still
 *  a PLACEHOLDER the cell says so instead of publishing a price nobody has approved. */
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
export function resolveCell(source: RowSource, column: GridColumn, input: PricingGridInput): GridCell {
  switch (source.from) {
    case 'entitlement':
      return entitlementCell(source.key, column)
    case 'gate':
      return gateCell(source.feature, column, input.gateOverrides ?? {})
    case 'meter':
      return meterCell(source.feature, column)
    case 'takeRate': {
      if (column.axis !== 'plan') {
        // A rate is only honest where a sale can happen. The personal selling gates open at Crew, so the
        // free Member column says selling is not included rather than printing the Crew rate under it.
        if (!personalSellingAllowed(column.tier, input.gateOverrides ?? {})) {
          return { kind: 'no', text: 'Selling is not included' }
        }
        return { kind: 'value', text: formatBps(input.values.take_rate.member_bps) }
      }
      return { kind: 'value', text: formatBps(input.values.take_rate.network_bps[column.tier as SpacePlan]) }
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
        key: 'space_qr',
        label: 'QR codes',
        detail: 'Printable codes that open straight to a page in your Space.',
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
      {
        key: 'multi_pipeline',
        label: 'Multiple pipelines',
        detail: 'Run more than one pipeline side by side.',
        source: { from: 'entitlement', key: 'multi_pipeline' },
      },
      {
        key: 'space_multi_pipeline',
        label: 'Pipelines included',
        detail: 'How many pipelines you can run at once.',
        source: { from: 'meter', feature: 'space_multi_pipeline' },
      },
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
        key: 'email',
        label: 'Email campaigns',
        detail: 'Write a campaign, pick who gets it, and send or schedule it.',
        source: { from: 'entitlement', key: 'email' },
      },
      {
        key: 'space_email',
        label: 'Email sends',
        detail: 'How much you can send each month.',
        source: { from: 'meter', feature: 'space_email' },
      },
      {
        key: 'automation',
        label: 'Marketing automation',
        detail: 'Follow-up that runs on its own once you set it.',
        source: { from: 'entitlement', key: 'automation' },
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
        key: 'space_storefront',
        label: 'Storefront and shop',
        detail: 'Sell your catalog and take orders from your page.',
        source: { from: 'gate', feature: 'space_storefront' },
      },
      {
        key: 'space_bookings',
        label: 'Bookings',
        detail: 'Set your weekly times and let members book them.',
        source: { from: 'meter', feature: 'space_bookings' },
      },
      {
        key: 'space_memberships',
        label: 'Memberships',
        detail: 'Your own membership tiers, and the members on them.',
        source: { from: 'meter', feature: 'space_memberships' },
      },
      {
        key: 'space_tickets',
        label: 'Tickets',
        detail: 'Ticket tiers for your events, and check-in at the door.',
        source: { from: 'meter', feature: 'space_tickets' },
      },
      {
        key: 'space_membership_tickets',
        label: 'Members-only ticket tiers',
        detail: 'Restrict a ticket tier to your own members.',
        source: { from: 'gate', feature: 'space_membership_tickets' },
      },
      {
        key: 'take_rate',
        label: 'Take-rate on network-sourced sales',
        detail:
          'You keep 100% of the business you bring in yourself, and 0% applies for good to anyone already in your world: a follower, one of your members, a contact, or someone who bought before. Frequency charges once for the introduction. After that they are your people, free.',
        source: { from: 'takeRate' },
      },
    ],
  },
  {
    key: 'site',
    label: 'Site and branding',
    rows: [
      {
        key: 'space_full_website',
        label: 'Multi-page website',
        detail: 'More than one page: your own site, run from your Space.',
        source: { from: 'entitlement', key: 'space_full_website' },
      },
      {
        key: 'whitelabel',
        label: 'White-label brand and domain',
        detail: 'Your own name and your own domain, with Frequency out of the frame.',
        source: { from: 'entitlement', key: 'whitelabel' },
      },
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
    key: 'programs',
    label: 'Practices and Journeys',
    rows: [
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
  {
    key: 'rewards',
    label: 'Rewards and status',
    rows: [
      {
        key: 'gamification_full',
        label: 'The full rewards loop',
        detail: 'Streaks, seasons, and the ladder. Free members earn; Crew plays the whole loop.',
        source: { from: 'gate', feature: 'gamification_full' },
      },
      {
        key: 'vault_cash_in',
        label: 'Spend Gems and claim rewards',
        detail: 'Turn what you have earned into something real.',
        source: { from: 'gate', feature: 'vault_cash_in' },
      },
    ],
  },
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
    label: 'Selling',
    rows: [
      {
        key: 'event_paid_tickets',
        label: 'Sell tickets to your own events',
        detail: 'Charge for an event you host. Free members create events and take RSVPs.',
        source: { from: 'gate', feature: 'event_paid_tickets' },
      },
      {
        key: 'personal_payouts',
        label: 'Take payments and get paid out',
        detail: 'Your own payouts, without running a Space.',
        source: { from: 'gate', feature: 'personal_payouts' },
      },
      {
        key: 'take_rate',
        label: 'Take-rate on network-sourced sales',
        detail:
          'You keep 100% from anyone already yours: a follower, a contact, or someone who bought before. Frequency charges once for the introduction. After that they are your people, free. Running a Business Space buys the rate on new introductions down further.',
        source: { from: 'takeRate' },
      },
    ],
  },
]

// ── Building the grids ───────────────────────────────────────────────────────────────────────────────

/** Turn an offering into the column a cell resolves against. PURE. */
export function offeringColumn(offering: Offering): GridColumn {
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

/** The SPACE comparison grid: five columns (Free, Business, Collective, Non Profit, Independent) and
 *  every row derived from the tier depth key sets, the gates, the meters, and the pricing config. PURE. */
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
  const teamTiers = SPACE_PLANS.filter((p) => planEntitlementKeys(p).includes('team')).map(
    (p) => SPACE_PLAN_LABEL[p],
  )
  const paidTiers = SPACE_PLANS.filter((p) => planEntitlementKeys(p).length > 0).map((p) => SPACE_PLAN_LABEL[p])

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

/** Join labels into a plain English list ("Business, Collective, Non Profit, and Independent"). PURE. */
function listPhrase(items: readonly string[]): string {
  if (items.length === 0) return 'none yet'
  if (items.length === 1) return items[0]!
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
