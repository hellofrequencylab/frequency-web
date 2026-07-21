// THE VALUE COMPARISON (pricing page, ADR-590 companion). A PURE, typed catalog that maps EVERY Business
// feature to the separate tool a business would otherwise pay for, and that tool's typical entry price, so
// the pricing page can total the stack and set it against Frequency's one flat price. Data only (no IO, no
// framework), so it renders on the static pricing page and is unit-testable.
//
// HONESTY (docs/CONTENT-VOICE.md skeptic test): every competitor figure is a TYPICAL ENTRY-TIER list price
// in USD per month, rounded, and they change often. Many of these tools also charge PER SEAT and add their
// own transaction fees on top, which the note calls out. Fee-based rows (events, donations) carry no fixed
// monthly price, so they are shown but excluded from the subscription total. No em dashes.

/** One feature row: what a business gets from Frequency, the separate tool they would otherwise buy, and
 *  that tool's typical monthly price (null for a fee-based tool with no fixed subscription). */
export interface ComparisonRow {
  /** The Frequency feature, in plain product voice (NAMING.md). */
  feature: string
  /** One line on what it does / what is included. */
  ours: string
  /** The stand-alone tool a business typically buys for this. */
  competitor: string
  /** That tool's typical entry monthly price (USD). null = fee-based / no fixed monthly price. */
  competitorMonthly: number | null
  /** An optional caveat shown under the price (per seat, plus fees, no real equivalent). */
  note?: string
}

/** A titled group of feature rows (the pricing comparison renders one block per group). */
export interface ComparisonGroup {
  title: string
  rows: readonly ComparisonRow[]
}

// The Frequency anchor prices the stack is set against. Business is the flat plan (ADR-590); the all-in
// number is Business with every add-on turned on. Constants so the copy + total stay in one place.
export const FREQUENCY_BUSINESS_MONTHLY = 49
export const FREQUENCY_ALL_IN_MONTHLY = 79

export const COMPARISON_GROUPS: readonly ComparisonGroup[] = [
  {
    title: 'Your site and brand',
    rows: [
      {
        feature: 'Branded Space site and custom domain',
        ours: 'A full website on your own domain, no code.',
        competitor: 'Squarespace',
        competitorMonthly: 23,
      },
      {
        feature: 'Brand and image studio (the Loom)',
        ours: 'One library for every logo, photo, and graphic across your Space.',
        competitor: 'Canva Pro',
        competitorMonthly: 15,
      },
      {
        feature: 'AI copy and images (Vera)',
        ours: 'Drafts your listings, emails, and art in your voice.',
        competitor: 'Jasper AI',
        competitorMonthly: 49,
      },
    ],
  },
  {
    title: 'Clients and scheduling',
    rows: [
      {
        feature: 'Booking and scheduling',
        ours: 'Your weekly hours, services, and a calendar members book.',
        competitor: 'Calendly',
        competitorMonthly: 12,
        note: 'Per seat above one user.',
      },
      {
        feature: 'CRM: pipeline, contacts, notes',
        ours: 'Every contact, their stage, and private notes in one board.',
        competitor: 'HubSpot Starter',
        competitorMonthly: 20,
        note: 'Priced per seat and per contact.',
      },
      {
        feature: 'Shared inbox and two-way messaging',
        ours: 'Read and reply to every contact through the consent gate.',
        competitor: 'Front',
        competitorMonthly: 19,
        note: 'Per seat.',
      },
      {
        feature: 'Business card scanner',
        ours: 'Scan a card and the contact lands in your CRM. Free for everyone.',
        competitor: 'CamCard',
        competitorMonthly: 6,
      },
    ],
  },
  {
    title: 'Marketing and growth',
    rows: [
      {
        feature: 'Email campaigns',
        ours: 'Design, send, and schedule branded email to your list.',
        competitor: 'Mailchimp',
        competitorMonthly: 20,
        note: 'Climbs with list size.',
      },
      {
        feature: 'Automation and drip sequences',
        ours: 'Rules and drips over your own contacts.',
        competitor: 'ActiveCampaign',
        competitorMonthly: 29,
      },
      {
        feature: 'QR codes and link tracking',
        ours: 'Codes for your Space and the scans they drive.',
        competitor: 'Bitly',
        competitorMonthly: 29,
      },
      {
        feature: 'Reviews and reputation',
        ours: 'A rating and review wall on your profile.',
        competitor: 'Birdeye',
        competitorMonthly: 30,
      },
    ],
  },
  {
    title: 'Selling and money',
    rows: [
      {
        feature: 'Online store',
        ours: 'A storefront, catalog, and orders on your page.',
        competitor: 'Shopify Basic',
        competitorMonthly: 39,
      },
      {
        feature: 'Memberships and subscriptions',
        ours: 'Paid tiers members join, recurring.',
        competitor: 'Memberful',
        competitorMonthly: 25,
        note: 'Plus its own fee on each charge.',
      },
      {
        feature: 'Courses, programs, and journeys',
        ours: 'Build practices into multi week programs and enroll members.',
        competitor: 'Kajabi',
        competitorMonthly: 149,
      },
      {
        feature: 'Audio and video hosting (Airwaves)',
        ours: 'Host recordings and attach them anywhere in your Space.',
        competitor: 'Buzzsprout',
        competitorMonthly: 18,
      },
      {
        feature: 'Event tickets and check-in',
        ours: 'Free or paid tickets, RSVPs, and a door code.',
        competitor: 'Eventbrite',
        competitorMonthly: null,
        note: 'Fees per ticket, on top.',
      },
      {
        feature: 'Donations',
        ours: 'A fund and amounts members can give.',
        competitor: 'Donorbox',
        competitorMonthly: null,
        note: 'Platform fee per gift, on top.',
      },
    ],
  },
  {
    title: 'Community and the network',
    rows: [
      {
        feature: 'Member community and circles',
        ours: 'A real community space, not just a contact list.',
        competitor: 'Mighty Networks',
        competitorMonthly: 41,
      },
      {
        feature: 'Cross-business referrals and shared audiences',
        ours: 'Aligned businesses lend each other their audiences, and every real-world intro becomes a new person in Frequency.',
        competitor: 'No real equivalent',
        competitorMonthly: null,
        note: 'The reason to be here. You cannot buy this as a tool.',
      },
      {
        feature: 'Team roles and seats',
        ours: 'Your whole team, at no per-seat charge.',
        competitor: 'Everywhere else',
        competitorMonthly: null,
        note: 'Nearly every tool above bills per seat.',
      },
    ],
  },
]

/** Every row across all groups, flat. */
export function allComparisonRows(): ComparisonRow[] {
  return COMPARISON_GROUPS.flatMap((g) => g.rows)
}

/** The number of separate tools mapped (every row, fee-based tools included: a business still juggles them). */
export function comparisonToolCount(): number {
  return allComparisonRows().filter((r) => r.competitor !== 'Everywhere else' && r.competitor !== 'No real equivalent').length
}

/** The total monthly SUBSCRIPTION cost of the separate stack (fee-based / no-equivalent rows excluded, since
 *  they carry no fixed monthly price). This is the honest floor: fees and per-seat charges stack on top. */
export function competitorMonthlyTotal(): number {
  return allComparisonRows().reduce((sum, r) => sum + (r.competitorMonthly ?? 0), 0)
}

/** The Frequency saving against the separate-stack subscription floor, per month + per year. */
export function monthlySaving(): number {
  return Math.max(0, competitorMonthlyTotal() - FREQUENCY_BUSINESS_MONTHLY)
}
export function yearlySaving(): number {
  return monthlySaving() * 12
}

/** The one honest caveat shown under the table (skeptic test). */
export const COMPARISON_DISCLAIMER =
  'Prices are typical entry-tier list prices and change often. Most of these tools also charge per seat and add their own transaction fees on top. Frequency is one flat price, plus a flat 3% and card processing, never per seat.'
