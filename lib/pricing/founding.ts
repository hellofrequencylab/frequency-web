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

  // ── 🔴 RETIRED: the three `business_*` fields below configure NOTHING (owner directive, 2026-07-31).
  //
  // The Founding BUSINESS per-city cohort is withdrawn. Its entire purchase path is deleted:
  // `lib/founding/business-checkout.ts` and the `/spaces/[slug]/settings/billing/founding` route are
  // gone, so no checkout reads these values and no Space can join the cohort.
  //
  // They survive as FIELDS ONLY so the existing `founding` pricing_settings row still narrows without
  // a migration, and so the admin console (mid-rewrite on PR #1999) keeps compiling. ⚠️ That console
  // still renders a Founding Business editor, which is now an operator control that does nothing:
  // the deliberate cost of not editing a file another branch is rewriting. Deleting that row, these
  // three fields, and the stored keys is the follow-up once #1999 lands.
  //
  // 🔴 NOT retired with them: the `founding_members` rows themselves. Three real Spaces paid cash for
  // this and are grandfathered, and `foundingBadgeForSpace` still renders their chip. Withdrawing an
  // offer is not the same as withdrawing recognition from the people who took it.

  /** @deprecated Configures nothing. See the retirement note above. */
  business_monthly_cents: number
  /** @deprecated Configures nothing. See the retirement note above. */
  business_take_bps: number
  /** @deprecated Configures nothing. See the retirement note above. */
  business_city_cap: number
}

/** The seeded launch-target founding config. Kept in sync with the pricing_settings seed and the
 *  code defaults in lib/pricing/settings.ts (member one-time mirrors lib/billing/founders.ts). */
export const FOUNDING_DEFAULT: FoundingConfig = {
  member_one_time_cents: 25000, // $250, locked for life (the Founders Round)
  member_cap: 150, // the first 150
  business_monthly_cents: 1900, // $19 / mo founding anchor under the $29 Business list (ADR-811). The
  //                               founding ladder runs $19 -> $29 -> $49 -> $79 (Business founding/list,
  //                               Collective founding/list). Yearly derives as two months free ($190).
  //                               Owner may edit this in the `founding` pricing_settings row; the
  //                               take-rate buy-down (3%) stays regardless.
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
