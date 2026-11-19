// Seller shipping profiles (DEF-ETSY P3). PURE: the shape of a profile, the one parser every read and every
// write goes through, and the quote the cart shows. The store is ./shipping-profiles-store.ts.
//
// A profile is how one seller ships: processing days and a short table of rates by place. Each rate is the
// price of the first item and of each extra item, the way Etsy charges: within one profile the first unit
// pays `firstCents` and every other unit pays `additionalCents`; two profiles in one cart add up. A listing
// with no profile adds nothing, which is today's behaviour.
//
// WHAT IT CANNOT SEE: the buyer's country before the secure payment page asks for it. With no country the
// quote uses the profile's "everywhere else" rate, or its lowest rate when it has none, and says it is an
// estimate. Nothing here is charged: the checkout door does not carry a shipping line yet.

/** The region that matches any country the profile does not name. */
export const EVERYWHERE = '*'

const MAX_RATES = 50
const MAX_CENTS = 1_000_000

export interface ShippingRate {
  /** An ISO-3166 alpha-2 code, upper case, or EVERYWHERE. */
  region: string
  firstCents: number
  additionalCents: number
}

export interface ShippingProfile {
  id: string
  name: string
  currency: string
  processingDaysMin: number
  processingDaysMax: number
  rates: ShippingRate[]
}

const cents = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_CENTS ? Math.round(n) : null
}

/** Every stored or posted rate list passes through here. Drops anything malformed and any repeated region
 *  (the first wins), caps the list, and never throws. */
export function parseShippingRates(raw: unknown): ShippingRate[] {
  if (!Array.isArray(raw)) return []
  const out: ShippingRate[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= MAX_RATES) break
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const region = String(r.region ?? '').trim().toUpperCase()
    if (region !== EVERYWHERE && !/^[A-Z]{2}$/.test(region)) continue
    if (seen.has(region)) continue
    const first = cents(r.firstCents)
    if (first == null) continue
    const additional = cents(r.additionalCents) ?? 0
    seen.add(region)
    out.push({ region, firstCents: first, additionalCents: additional })
  }
  return out
}

/** The rate a profile charges to `country`, or to an unknown country. Null when it does not ship there. */
function rateFor(profile: ShippingProfile, country: string | null): ShippingRate | null {
  const c = country?.trim().toUpperCase() || null
  const named = c ? profile.rates.find((r) => r.region === c) : undefined
  if (named) return named
  const everywhere = profile.rates.find((r) => r.region === EVERYWHERE)
  if (everywhere) return everywhere
  if (c) return null
  return profile.rates.reduce<ShippingRate | null>((low, r) => (!low || r.firstCents < low.firstCents ? r : low), null)
}

export interface CartShippingQuote {
  totals: { currency: string; cents: number }[]
  /** True when no country was given, so the amount is the profile's default or lowest rate. */
  estimate: boolean
  /** Product ids whose profile does not ship to the country asked about. */
  unshippable: string[]
}

/** Shipping for a cart's lines, from the profile each listing points at. PURE. */
export function quoteCartShipping(
  lines: readonly { productId: string; qty: number }[],
  profiles: ReadonlyMap<string, ShippingProfile>,
  country: string | null = null,
): CartShippingQuote {
  const units = new Map<string, { profile: ShippingProfile; qty: number }>()
  const unshippable: string[] = []
  for (const l of lines) {
    const profile = profiles.get(l.productId)
    if (!profile || l.qty <= 0) continue
    if (!rateFor(profile, country)) {
      unshippable.push(l.productId)
      continue
    }
    const u = units.get(profile.id)
    if (u) u.qty += l.qty
    else units.set(profile.id, { profile, qty: l.qty })
  }
  const byCurrency = new Map<string, number>()
  for (const { profile, qty } of units.values()) {
    const rate = rateFor(profile, country)!
    const amount = rate.firstCents + rate.additionalCents * (qty - 1)
    const currency = profile.currency.toLowerCase()
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount)
  }
  return {
    totals: [...byCurrency].map(([currency, c]) => ({ currency, cents: c })),
    estimate: !country,
    unshippable,
  }
}
