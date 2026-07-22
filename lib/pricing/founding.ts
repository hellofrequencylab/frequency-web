// FOUNDING RATES — the operator-editable config for the Founders Round (members) and the
// Founding Businesses cohort. PURE config + helpers (no Supabase/Next), like lib/pricing/
// bundle.ts: it shapes the operator settings, resolves defaults, and computes spots-remaining.
// The settings READER (getFoundingConfig, service-role) lives in lib/pricing/settings.ts
// alongside getHouseholdBundle; the durable per-founder record + the grant hook live in
// lib/founding/status.ts.
//
// EVERYTHING SHIPS OFF (the ABSOLUTE INVARIANT, ADR-362): a founding RATE is display + a locked
// value on the durable record; it never charges on its own. Nothing here charges. The live money
// flip lives behind billingLive() / payoutsLive() and is owned by the billing path.
//
// THE FOUNDING BUSINESS OFFER (the fee-buydown): a Founding Business locks the bought-down
// marketplace take-rate (3% vs the 5-8% standard ladder, ADR-596) AND a locked annual membership
// rate, against a per-CITY cap. These defaults are editable at /admin/pricing via the
// 'founding' pricing_settings key.

/** The founding config (pricing_settings key 'founding'). All amounts in CENTS, rates in basis
 *  points (300 = 3%), caps as counts. Mirrors the migration/settings seed defaults. */
export interface FoundingConfig {
  /** The one-time Founding MEMBER rate, locked for life (the Founders Round core tier, $250). */
  member_one_time_cents: number
  /** How many Founding MEMBER seats the round holds (the first 150). */
  member_cap: number
  /** The Founding BUSINESS locked MONTHLY membership rate ($49/mo, matching the live Business plan). */
  business_monthly_cents: number
  /** The Founding BUSINESS bought-down marketplace take-rate, in basis points (300 = 3%). */
  business_take_bps: number
  /** The per-CITY Founding BUSINESS cap (spots-remaining is computed over this). */
  business_city_cap: number
}

/** The seeded launch-target founding config. Kept in sync with the pricing_settings seed and the
 *  code defaults in lib/pricing/settings.ts (member one-time mirrors lib/billing/founders.ts). */
export const FOUNDING_DEFAULT: FoundingConfig = {
  member_one_time_cents: 25000, // $250, locked for life (the Founders Round)
  member_cap: 150, // the first 150
  business_monthly_cents: 4900, // $49 / mo, matching the live Business plan (owner decision 2026-07-21;
  //                               the live value is also set in the `founding` pricing_settings row)
  business_take_bps: 300, // 3% (bought down from the 5-8% ladder, ADR-596)
  business_city_cap: 25, // 25 founding businesses per city
}

/** Narrow a raw pricing_settings value to a FoundingConfig, FAIL-SAFE to the default for any
 *  missing/garbage field (so the founding config always resolves). PURE. */
export function asFoundingConfig(raw: unknown): FoundingConfig {
  if (!raw || typeof raw !== 'object') return FOUNDING_DEFAULT
  const r = raw as Record<string, unknown>
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback
  return {
    member_one_time_cents: num(r.member_one_time_cents, FOUNDING_DEFAULT.member_one_time_cents),
    member_cap: num(r.member_cap, FOUNDING_DEFAULT.member_cap),
    business_monthly_cents: num(r.business_monthly_cents, FOUNDING_DEFAULT.business_monthly_cents),
    business_take_bps: num(r.business_take_bps, FOUNDING_DEFAULT.business_take_bps),
    business_city_cap: num(r.business_city_cap, FOUNDING_DEFAULT.business_city_cap),
  }
}

/** How many Founding BUSINESS spots remain in a city given the config + the count already taken
 *  (reserved or active). Never negative. PURE — the IO that counts taken spots lives in
 *  lib/founding/status.ts (foundingBusinessSpotsRemaining). */
export function foundingBusinessSpotsRemaining(config: FoundingConfig, takenInCity: number): number {
  return Math.max(0, config.business_city_cap - Math.max(0, takenInCity))
}

/** The largest a basis-points field can be: 10000 = 100%. A take-rate above 100% is nonsense. */
const MAX_BPS = 10000

/** Sanitize an operator-supplied founding config for a WRITE: narrow every field fail-safe to the
 *  default (asFoundingConfig floors negatives/garbage to the default and to whole non-negative ints),
 *  then clamp the take-rate to at most 100% so a typo can never store an impossible fee. PURE. The
 *  admin saveFoundingConfig action runs this before persisting the `founding` pricing_settings key, so
 *  the stored value is always a well-formed FoundingConfig — nothing here charges (ADR-362). */
export function sanitizeFoundingConfig(raw: unknown): FoundingConfig {
  const base = asFoundingConfig(raw)
  return { ...base, business_take_bps: Math.min(MAX_BPS, base.business_take_bps) }
}
