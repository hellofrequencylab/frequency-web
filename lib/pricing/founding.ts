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

  // ── 🔴 THE PER-CITY COHORT IS RETIRED (owner directive, 2026-07-31) — but only ONE of the three
  //    `business_*` fields below went with it. Corrected 2026-08-10; the previous note said all three
  //    "configure NOTHING" and that the console editor "does nothing", and both were wrong.
  //
  // What IS gone: the per-city purchase path. `lib/founding/business-checkout.ts` and the
  // `/spaces/[slug]/settings/billing/founding` route are deleted, so no CHECKOUT reads these values.
  // That much the original note had right — and it is exactly the sentence that made the rest wrong,
  // because "no checkout reads them" was read as "nothing reads them."
  //
  // ⚠️ A SECOND, LIVE PATH mints Founding Businesses and it is not a checkout: the BETA FOUNDER PUSH
  // (ADR-875, tightened by ADR-880). `lib/billing/space-subscriptions.ts` grants at Stripe
  // reconciliation → `lib/billing/beta-founding.ts:95` → `grantFoundingStatus`, which reads
  // `business_monthly_cents` and `business_take_bps` (`lib/founding/status.ts:280-281`, and again on
  // the update branch at `:352-353`) to stamp `locked_rate_cents` / `locked_take_bps` onto the new row.
  // Those are LIFETIME terms. So the pricing console's "Founding Businesses" editor is not inert: an
  // operator editing it sets the rate and the marketplace fee that every future Founding Business is
  // grandfathered at. Calling it a control that does nothing invited someone to change it carelessly
  // or delete the fields outright.
  //
  // 🔴 NOT retired: the `founding_members` rows themselves. Three real Spaces paid cash for this and
  // are grandfathered (verified against the database on 2026-08-10: 3 rows, kind='business',
  // status='active', all space-keyed), and `foundingBadgeForSpace` still renders their chip.
  // Withdrawing an offer is not the same as withdrawing recognition from the people who took it.

  /** LIVE: stamped as `locked_rate_cents` on every new Founding Business by the beta-founder grant. */
  business_monthly_cents: number
  /** LIVE: stamped as `locked_take_bps` by the same grant. A lifetime marketplace-fee term. */
  business_take_bps: number
  /**
   * @deprecated Genuinely dead — the ONE field the retirement did take with it. Its only reader is
   * `foundingBusinessSpotsRemaining` below, whose only remaining callers are its own tests; the
   * per-city cap it expressed had meaning solely for the deleted checkout. Safe to remove together
   * with that helper and the stored key.
   */
  business_city_cap: number
}

/** The seeded launch-target founding config. Kept in sync with the pricing_settings seed and the
 *  code defaults in lib/pricing/settings.ts (member one-time mirrors lib/billing/founders.ts (retired)). */
export const FOUNDING_DEFAULT: FoundingConfig = {
  member_one_time_cents: 25000, // $250, locked for life (the Founders Round)
  member_cap: 150, // the first 150
  // 🔴 $29, THE LIST RATE — there is NO founding discount for Business (ADR-1067). This was 1900, the
  //    $19 anchor from the 2026-07-24 ladder, and it is not a display number: `grantFoundingStatus`
  //    stamps it onto a new founding row as `locked_rate_cents` when the caller passes no amount
  //    (lib/founding/status.ts:281, and again on the update branch at :353), and that is a LIFETIME
  //    term. Left at 1900 it would have gone on handing out a permanent $19 through a FALLBACK, months
  //    after the owner removed founding pricing from everything a customer can see. The one beta rate
  //    that still exists is Collective's, it is unlisted, and it is granted by hand — never defaulted.
  //
  //    WHAT THIS DOES NOT DO: it does not retire the Founding Business PROGRAM. The badge, the 25-per-
  //    city cap and the 3% take-rate buy-down are recognition, not a discount, and they are untouched.
  //    A Founding Business is now someone recognised at the normal rate.
  business_monthly_cents: 2900,
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
