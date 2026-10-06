// THE PRICE OF A DOMAIN BOUGHT INSIDE FREQUENCY (LIVE-781). PURE, so the panel, the server actions, the
// checkout and the tests all do the same sum.
//
// OWNER RULING (2026-10-06): a domain sells at Vercel's at-cost price plus a SMALL markup, and the Space
// pays renewals. The markup is an operator setting (pricing_settings key `domain_markup`, read through
// lib/pricing/settings.ts getDomainMarkupCents), never a figure in code. The default below is only the
// fallback when no row is stored or the read fails: $3 a year, in whole cents.
//
// Vercel quotes prices in US DOLLARS, as a number or a numeric string (`"11.25"`). Everything in this
// repo bills in whole cents, so the quote is converted once, here, and rounded to the cent.

/** The fallback yearly markup in cents ($3), used when the operator has stored nothing. */
export const DOMAIN_MARKUP_DEFAULT_CENTS = 300

/** A ceiling on the operator markup, so a typo in the console ($3000 for $30) cannot reach a buyer. */
export const DOMAIN_MARKUP_MAX_CENTS = 10_000

/** The pricing_settings key the markup lives under, as `{ cents: number }`. */
export const DOMAIN_MARKUP_SETTING_KEY = 'domain_markup'

/** A Vercel dollar amount (number or numeric string) as whole cents, or null when it is not a price. */
export function usdToCents(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

/** The stored `domain_markup` setting as whole non-negative cents, clamped to the ceiling. Accepts the
 *  stored shape `{ cents }` or a bare number. Anything unreadable is the default. */
export function asDomainMarkupCents(raw: unknown): number {
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { cents?: unknown }).cents : raw
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0) return DOMAIN_MARKUP_DEFAULT_CENTS
  return Math.min(Math.round(n), DOMAIN_MARKUP_MAX_CENTS)
}

export interface DomainQuote {
  /** What Vercel charges Frequency for the first year, in cents. */
  vercelCents: number
  /** Frequency's markup for the year, in cents. */
  markupCents: number
  /** What the Space pays for the year: the one number the buyer sees. */
  totalCents: number
  /** What the Space pays each year after, Vercel's renewal price plus the same markup. */
  renewalCents: number
}

/** One searched name: free with its yearly quote, or why it cannot be bought here. */
export type DomainSearch =
  | { domain: string; available: true; quote: DomainQuote }
  | { domain: string; available: false; reason: 'taken' | 'unsupported' }

/** Frequency's yearly price: Vercel's price plus the markup, in whole cents. The renewal is priced the
 *  same way from Vercel's renewal price (it falls back to the purchase price when Vercel gives none). */
export function quoteDomain(vercelCents: number, markupCents: number, vercelRenewalCents?: number | null): DomainQuote {
  const base = Math.max(0, Math.round(vercelCents))
  const markup = Math.max(0, Math.round(markupCents))
  const renewalBase = vercelRenewalCents != null && vercelRenewalCents > 0 ? Math.round(vercelRenewalCents) : base
  return { vercelCents: base, markupCents: markup, totalCents: base + markup, renewalCents: renewalBase + markup }
}

/** `$23.00`, for the one yearly price. */
export function formatYearlyPrice(cents: number): string {
  return `$${(Math.max(0, Math.round(cents)) / 100).toFixed(2)}`
}
