// MEMBER CONNECT TAX PATH (PROG-E7, ADR-175, EDITOR-ARCHITECTURE D-3): what a member who earns through
// their own Stripe Express account owes the tax system, and how the product tells them. Dark: nothing
// here moves money or files anything. Stripe is the filer of record for Express accounts (it collects the
// tax identity during onboarding and issues the 1099 forms once the PLATFORM opts in to Stripe's tax
// reporting for Connect, an owner step in the Stripe Dashboard, see docs/RUNBOOKS.md). Frequency's part is
// to read what Stripe still needs, warn a member before a 1099 is likely, and stay off the money path.
//
// The thresholds below are ADVISORY (they drive a "heads up" in settings, never a filing) and live in one
// place so a change in law is a one-line edit. Stripe's own determination always wins.
import type Stripe from 'stripe'
import { envFlag } from '@/lib/env/string'

export const CONNECT_TAX_FLAG = 'CONNECT_TAX_REPORTING_ENABLED'

/** Opt-in. Off, every surface that would show a 1099 notice shows nothing. */
export function connectTaxReportingEnabled(): boolean {
  return envFlag(CONNECT_TAX_FLAG)
}

/** The US 1099-K threshold (advisory): payment-processor gross above $20,000 AND more than 200 transactions
 *  in a calendar year. Member earnings settle through Stripe, so 1099-K is the form in play; NEC/MISC
 *  forms are for a payer that pays directly, which Frequency does not. */
export const FORM_1099_THRESHOLDS = {
  kGrossCents: 20_000_00,
  kTransactions: 200,
} as const

/** How close a member's calendar-year earnings are to a 1099. `approaching` starts at 80% of a threshold. */
export type Form1099Status = 'below' | 'approaching' | 'likely'

export function form1099Status(grossCents: number, transactions: number): Form1099Status {
  const g = Number.isFinite(grossCents) && grossCents > 0 ? grossCents : 0
  const n = Number.isFinite(transactions) && transactions > 0 ? transactions : 0
  const t = FORM_1099_THRESHOLDS
  if (g > t.kGrossCents && n > t.kTransactions) return 'likely'
  if (g >= t.kGrossCents * 0.8 && n >= t.kTransactions * 0.8) return 'approaching'
  return 'below'
}

// Stripe requirement keys that mean "the tax identity is missing" (SSN last 4, full ID number, EIN).
const TAX_IDENTITY_KEY = /(^|\.)(ssn_last_4|id_number|tax_id|ssn)(\.|$)/

export interface TaxInfoState {
  /** Stripe still needs the member's tax identity before it can report their earnings. */
  needsTaxInfo: boolean
  /** The Stripe requirement keys behind that, for support. */
  keys: string[]
}

/** Read the tax-identity gap off a mirrored Stripe account. Pure; never calls Stripe. */
export function taxInfoState(account: Pick<Stripe.Account, 'requirements'> | null): TaxInfoState {
  const req = account?.requirements
  const due = [...(req?.currently_due ?? []), ...(req?.past_due ?? []), ...(req?.eventually_due ?? [])]
  const keys = [...new Set(due.filter((k) => TAX_IDENTITY_KEY.test(k)))]
  return { needsTaxInfo: keys.length > 0, keys }
}

/** The one line a member sees in payout settings, or null when there is nothing to say (flag off, below
 *  every threshold, no gap). Plain words, no hard claim about their taxes. */
export function taxNotice(args: { gross: { cents: number; transactions: number }; info: TaxInfoState }): string | null {
  if (!connectTaxReportingEnabled()) return null
  if (args.info.needsTaxInfo) return 'Stripe needs your tax details before it can report your earnings. Add them in your payout settings.'
  const s = form1099Status(args.gross.cents, args.gross.transactions)
  if (s === 'likely') return 'Your earnings this year are likely to come with a 1099 from Stripe. Check your payout settings so the details are right.'
  if (s === 'approaching') return 'Your earnings this year are getting close to where Stripe sends a 1099. A good time to check your payout settings.'
  return null
}
