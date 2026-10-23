// THE MEMBER PRICING BOX, its data. One pure builder that turns the plan catalog into the six rungs the
// member-area pricing box draws (Member, Crew, Space, Business, Collective, Network): the fit line, five
// features, the price per interval, the Non Profit price and the comparison grid.
//
// 🔴 EVERY FIGURE IS READ, NEVER TYPED (ADR-916, lib/pricing/plan-story.ts). Prices come from the catalog the
// checkout bills from (spacePlanPriceCents, NETWORK_PLAN, the PWYW config), allowances from
// PLACEHOLDER_METER_LIMITS, fees from the resolved take-rate vector. A price or limit change moves this box with
// no copy edit. Plan NAMES and verbs are the canon (docs/NAMING.md).
//
// PURE and framework-free: the server loader (member-pricing-load.ts) resolves the IO and hands the inputs in;
// the client box (components/pricing/member-pricing-box.tsx) only draws what it is given. Copy follows
// docs/CONTENT-VOICE.md: plain, no em dashes, and no "0%" or "no fee" without "plus card processing".

import { NETWORK_PLAN, SPACE_PLAN_LABEL } from './plans'
import { SPACE_PLAN_PRICE_CENTS, spacePlanPriceCents } from './feature-tiers'
import { PLACEHOLDER_METER_LIMITS } from './meter-limits'
import { FEATURE_METERS } from './feature-meters'
import { COLLECTIVE_FOUNDING_ENDS_LABEL, networkFoundingOpen } from './beta'
import { COLLECTIVE_PARTNER_CAP } from './pricing-grid'
import { PLAN_STORY } from './plan-story'
import { CREW_PERKS } from '@/lib/crew/perks'
import { yearlyFromMonthly, type NetworkTakeRate } from '@/lib/billing/pricing-keys'
import { formatPriceCents } from '@/lib/commerce/types'

export const PRICING_TIER_KEYS = ['member', 'crew', 'space', 'business', 'collective', 'network'] as const
export type PricingTierKey = (typeof PRICING_TIER_KEYS)[number]

/** One rung of the box, every price already resolved to cents on the server. */
export interface PricingTier {
  key: PricingTierKey
  /** The ladder group label: "You" for the personal rungs, "Space" for the rest. */
  group: 'You' | 'Space'
  name: string
  verb: string
  fit: string
  /** Exactly five lines. */
  features: string[]
  /** Pay what you want: Crew has no single price, the amounts come from `crew`. */
  pwyw: boolean
  /** The monthly price charged today, or null when the rung has none (Crew). 0 is free. */
  monthlyCents: number | null
  /** The yearly price (ten months of the monthly), or null. */
  yearlyCents: number | null
  /** The verified Non Profit monthly and yearly price, or null when there is none to quote. */
  nonprofitMonthlyCents: number | null
  nonprofitYearlyCents: number | null
  /** The price reads as "From": Network starts at its first three chapters. */
  from: boolean
  /** The list anchor when the charged price is a Founding or Beta price under it. */
  listMonthlyCents: number | null
  listYearlyCents: number | null
  /** A one-sentence note under the price, per interval. */
  note: { month: string; year: string }
}

interface PricingCrew {
  minCents: number
  suggestedCents: number
  maxCents: number
  presetCents: number[]
}

export interface PricingBoxData {
  tiers: PricingTier[]
  /** The comparison grid: a label and one cell per tier, in ladder order. */
  comparison: { label: string; cells: string[] }[]
  /** How many allowances the grid speaks for: every plan-axis and tier-axis meter, read from the meter map. */
  allowances: number
  crew: PricingCrew
  /** Trial days on a Space plan checkout (the operator setting, default 14). 0 means none. */
  trialDays: number
}

interface PricingBoxInput {
  crew: PricingCrew
  trialDays: number
  /** The resolved operator take-rate vector (resolvedNetworkRate). */
  takeRate: NetworkTakeRate
  /** Today's date, so a Founding note closes on time. */
  now?: Date
}

const YES = '✓'
const NONE = '–'

/** The allowance on a plan-axis meter at a rung, as a number, or null for unlimited. */
function limit(feature: string, rung: string): number | null {
  const row = PLACEHOLDER_METER_LIMITS[feature]
  const value = row?.[rung]
  return typeof value === 'number' ? value : null
}

const n = (value: number | null): string => (value === null ? 'unlimited' : value.toLocaleString('en-US'))
const dollars = (cents: number): string => formatPriceCents(cents)
const bpsLabel = (bps: number): string => `${Number((bps / 100).toFixed(2))}%`

/** The copy of the rungs, with every number read. Built once per request. */
function copy(input: PricingBoxInput) {
  const crewCircles = limit('circle_host', 'crew')
  const crewEvents = limit('event_create', 'crew')
  const crewJourneys = limit('journey_publish', 'crew')
  const memberCircles = limit('circle_host', 'free')
  const memberEvents = limit('event_create', 'free')
  const partnerCap = COLLECTIVE_PARTNER_CAP
  const bizSeats = limit('space_team', 'business')
  const bizQr = limit('space_qr', 'business')
  const colQr = limit('space_qr', 'collective')
  const freeContacts = limit('space_crm', 'free')
  const freeEmail = limit('space_email', 'free')
  const colRate = bpsLabel(input.takeRate.collective)
  const netRate = bpsLabel(input.takeRate.network)

  return {
    member: {
      verb: 'joins',
      fit: 'Where everyone starts. Find your people and show up.',
      features: [
        'Join Circles and go to Events',
        `Host ${n(memberCircles)} Circle and ${n(memberEvents)} upcoming Events`,
        'Plans from your people in one feed',
        'Streaks, Zaps and Gems for showing up',
        'Free, always',
      ],
    },
    crew: {
      verb: 'hosts',
      fit: 'For when you want to give back and gather a few more people.',
      // Five lines. A perk is listed only once something is behind it (lib/crew/perks.ts `live`).
      features: [
        `Room to host more: ${n(crewCircles)} Circles, ${n(crewEvents)} upcoming Events and ${n(crewJourneys)} Journeys`,
        'Vera without the daily cap',
        'A monthly Boost for a Circle or Space you love',
        ...CREW_PERKS.filter((p) => p.live).map((p) => p.label),
        'A Space comes with Crew',
      ].slice(0, 5),
    },
    space: {
      verb: 'runs',
      fit: 'A home for your community, studio or practice. Free, and yours to keep.',
      features: [
        'Your page, Circles, Events, Practices and Journeys',
        `Up to ${n(freeContacts)} contacts and ${n(freeEmail)} emails a month`,
        'Bookings and one active automation',
        `Tips with no platform fee, ${PLAN_STORY.plusProcessing}`,
        'Limits sized for a launch. A full meter never removes what you built',
      ],
    },
    business: {
      verb: 'sells',
      fit: 'For the day people want to pay you for what you hold.',
      features: [
        'Paid tickets, memberships and donations',
        'Shop checkout, booking deposits and priced Journeys',
        'Your own multi-page website',
        'Higher limits on every tool',
        `${n(bizSeats)} operator seats and ${n(bizQr)} editable QR codes`,
      ],
    },
    collective: {
      verb: 'connects',
      fit: 'For groups that grow better together. Each keeps its own people and payouts.',
      features: [
        `A hub linking up to ${partnerCap} partner Spaces`,
        'Shared calendar, cross-listed Circles and Journeys',
        'Vera AI and a custom domain included',
        `${n(colQr)} editable QR codes and higher limits`,
        `A lower network fee, ${colRate}`,
      ],
    },
    network: {
      verb: 'unites',
      fit: 'For one organization gathering in many places.',
      features: [
        `${NETWORK_PLAN.includedChapters} chapters to start, up to ${NETWORK_PLAN.maxChapters}`,
        'One membership that works in every chapter',
        'Central admins and chapter leaders',
        'One network calendar, home and roll-up report',
        `The lowest network fee, ${netRate}`,
      ],
    },
  } as const
}

/** The comparison rows. A cell is a short word, a check or a dash. */
function comparison(input: PricingBoxInput): PricingBoxData['comparison'] {
  const memberCircles = limit('circle_host', 'free')
  const colRate = bpsLabel(input.takeRate.collective)
  const bizRate = bpsLabel(input.takeRate.paid)
  const netRate = bpsLabel(input.takeRate.network)
  const rows: [string, string[]][] = [
    ['Host Circles and Events', [`${n(memberCircles)} Circle`, 'More', YES, YES, YES, YES]],
    ['Your page and website', [NONE, NONE, 'Page', 'Full site', 'Full site', 'Full site']],
    ['Contacts, email, bookings', [NONE, NONE, 'Launch', 'Higher', 'Higher', 'Higher']],
    ['Tips, no platform fee, plus card processing', [NONE, NONE, YES, YES, YES, YES]],
    ['Tickets, memberships, shop', [NONE, NONE, NONE, YES, YES, YES]],
    ['Vera AI', [NONE, NONE, NONE, 'Add-on', YES, YES]],
    ['Custom domain', [NONE, NONE, NONE, 'Add-on', YES, YES]],
    ['Partner Spaces', [NONE, NONE, NONE, NONE, YES, NONE]],
    ['Chapters', [NONE, NONE, NONE, NONE, NONE, `${NETWORK_PLAN.includedChapters} to ${NETWORK_PLAN.maxChapters}`]],
    ['Network fee', [NONE, NONE, NONE, bizRate, colRate, netRate]],
  ]
  return rows.map(([label, cells]) => ({ label, cells }))
}

/** The whole box's data. PURE given its input. */
export function buildPricingBox(input: PricingBoxInput): PricingBoxData {
  const c = copy(input)
  const now = input.now ?? new Date()

  const monthly = (plan: Parameters<typeof spacePlanPriceCents>[0]) => spacePlanPriceCents(plan)
  const bizNow = monthly('business')
  const bizNp = monthly('nonprofit')
  const colNow = monthly('collective')
  const colList = SPACE_PLAN_PRICE_CENTS.collective.listCents
  const colNp = monthly('nonprofit_collective')
  const netNow = NETWORK_PLAN.monthlyCents
  const netNp = NETWORK_PLAN.nonprofitMonthlyCents

  const tier = (
    key: PricingTierKey,
    group: PricingTier['group'],
    name: string,
    base: { verb: string; fit: string; features: readonly string[] },
    extra: Partial<PricingTier>,
  ): PricingTier => {
    const monthlyCents = extra.monthlyCents ?? null
    return {
      key,
      group,
      name,
      verb: base.verb,
      fit: base.fit,
      features: [...base.features],
      pwyw: false,
      monthlyCents,
      yearlyCents: monthlyCents && monthlyCents > 0 ? yearlyFromMonthly(monthlyCents) : monthlyCents === 0 ? 0 : null,
      nonprofitMonthlyCents: null,
      nonprofitYearlyCents: null,
      from: false,
      listMonthlyCents: null,
      listYearlyCents: null,
      note: { month: '', year: '' },
      ...extra,
    }
  }

  const yearNote = 'Ten months of the monthly price.'
  const monthNote = 'Or two months free yearly.'
  const paidNote = { month: monthNote, year: yearNote }

  const founding =
    colList > colNow
      ? `Beta pricing, ${dollars(colList)} a month at list. Offer ends ${COLLECTIVE_FOUNDING_ENDS_LABEL}, and the price is yours for as long as you keep the plan. `
      : ''

  const netFounding = networkFoundingOpen(now)
    ? ` First-year Founding offer: ${NETWORK_PLAN.foundingYearMonths} months instead of ten, through ${COLLECTIVE_FOUNDING_ENDS_LABEL}.`
    : ''

  const tiers: PricingTier[] = [
    tier('member', 'You', 'Member', c.member, {
      monthlyCents: 0,
      note: { month: 'Free, always.', year: 'Free, always.' },
    }),
    tier('crew', 'You', 'Crew', c.crew, {
      pwyw: true,
      monthlyCents: null,
      yearlyCents: null,
      note: {
        month: 'Contribute what you want. Every amount buys the same Crew.',
        year: 'Contribute what you want. Yearly is ten months of your monthly amount.',
      },
    }),
    tier('space', 'Space', 'Space', c.space, {
      monthlyCents: 0,
      note: { month: 'Free to keep.', year: 'Free to keep.' },
    }),
    tier('business', 'Space', SPACE_PLAN_LABEL.business, c.business, {
      monthlyCents: bizNow,
      nonprofitMonthlyCents: bizNp,
      nonprofitYearlyCents: yearlyFromMonthly(bizNp),
      note: paidNote,
    }),
    tier('collective', 'Space', SPACE_PLAN_LABEL.collective, c.collective, {
      monthlyCents: colNow,
      listMonthlyCents: colList > colNow ? colList : null,
      listYearlyCents: colList > colNow ? yearlyFromMonthly(colList) : null,
      nonprofitMonthlyCents: colNp,
      nonprofitYearlyCents: yearlyFromMonthly(colNp),
      note: { month: `${founding}${monthNote}`, year: `${founding}${yearNote}` },
    }),
    tier('network', 'Space', SPACE_PLAN_LABEL.network, c.network, {
      from: true,
      monthlyCents: netNow,
      nonprofitMonthlyCents: netNp,
      nonprofitYearlyCents: yearlyFromMonthly(netNp),
      note: {
        month: `Starts at ${NETWORK_PLAN.includedChapters} chapters: ${dollars(NETWORK_PLAN.baseCents)} plus ${dollars(NETWORK_PLAN.chapterCents)} a chapter. ${monthNote}`,
        year: `${NETWORK_PLAN.includedChapters} chapters to start, then ${dollars(NETWORK_PLAN.extraChapterCents)} a month for each more.${netFounding} ${yearNote}`,
      },
    }),
  ]

  const allowances =
    Object.values(FEATURE_METERS).filter((m) => m.axis === 'plan').length +
    Object.values(FEATURE_METERS).filter((m) => m.axis === 'tier').length
  return { tiers, comparison: comparison(input), allowances, crew: input.crew, trialDays: input.trialDays }
}

/** The Space the box buys for. Null on the box means the viewer owns no Space yet. */
export interface PricingSpaceContext {
  slug: string
  name: string
  /** The Space's own plan label (spaces.plan), narrowed. */
  plan: string
  /** The viewer owns the Space and is not a staff preview, so a buy or a change is theirs to make. */
  canBuy: boolean
  /** The Space already pays for a plan, so a change goes through the billing portal (a second checkout would bill twice). */
  paid: boolean
  /** The Space is a verified 501(c)(3), so the Non Profit prices can be bought. */
  verified: boolean
  /** Business tools arrive through the Network the Space belongs to, so it has no plan of its own to change. */
  inherited: boolean
  /** An off-Stripe agreement the crew recorded runs the plan, so there is no checkout or portal to offer. */
  managed?: boolean
  /** Which plans sell right now (billing live AND the plan's own switch). */
  sellable: { business: boolean; collective: boolean; network: boolean; nonprofit: boolean; nonprofit_collective: boolean }
}

/** The viewer's own tier on the personal axis. */
export interface PricingPersonalContext {
  tier: 'member' | 'crew'
  /** Crew checkout is open (billing live AND the tier switch). */
  crewSellable: boolean
  /** Billing is off, so the free beta toggle is the only Crew path. */
  betaOpen: boolean
}

/** Which rung a Space plan label sits on in the box. Independent rides Business, the Non Profit plans ride their
 *  rung, and anything unknown is the free Space. PURE. */
export function tierForSpacePlan(plan: string | null | undefined): PricingTierKey {
  switch (plan) {
    case 'business':
    case 'nonprofit':
    case 'independent':
      return 'business'
    case 'collective':
    case 'nonprofit_collective':
      return 'collective'
    case 'network':
      return 'network'
    default:
      return 'space'
  }
}
