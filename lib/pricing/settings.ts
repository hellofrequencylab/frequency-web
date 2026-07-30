// PRICING SETTINGS + FLAGS — the operator-editable VALUES (prices, take-rates, caps, trial,
// annual discount) and the on/off switches that govern billing. Server-only (service-role reads),
// FAIL-SAFE: every read falls back to the seeded code defaults so a transient DB hiccup, or the
// pre-migration state, never breaks a price display or wrongly turns billing on.
//
// EVERYTHING SHIPS OFF (ADR-362, docs/PRICING.md). The CHARGING gate is `billingLive()` =
// billingEnabled() (the Stripe env keys, lib/billing/stripe.ts) AND the `billing_live` platform
// flag — so even a fully configured Stripe env stays OFF until an operator flips the master switch.
//
// TWO SWITCHES, NOT ONE (ADR-874). `billingLive()` answers "may we CHARGE". `featureGatesLive()`
// answers "do the paid feature GATES bite yet" = billingLive() AND the `beta_grace` window has ended.
// Charging paths take the first; every feature-gating path takes the second. Do not re-conflate them.
//
// THIS MODULE IS THE OPERATOR OVERLAY, NOT A PRICE LIST (Phase 5, ADR-916). The code-default values live
// in lib/pricing/defaults.ts, where every one of them is DERIVED: Space prices from the code catalog the
// checkout bills (lib/billing/pricing-keys.ts CATALOG), the take-rates from NETWORK_TAKE_RATE_DEFAULT (the
// same vector lib/billing/fees.ts falls back to), the Crew price from the one pure member-price map
// (lib/pricing/feature-tiers.ts). This file reads the `pricing_settings` table and layers it over them,
// the same contract gates.ts / page-chrome.ts use.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingEnabled } from '@/lib/billing/stripe'
import { PRICING_DEFAULTS, type PricingDefaults } from './defaults'
import {
  asHouseholdBundleConfig,
  HOUSEHOLD_BUNDLE_DEFAULT,
  type HouseholdBundleConfig,
} from './bundle'
import { asBetaGrace, betaGraceActive, BETA_GRACE_DEFAULT, type BetaGraceConfig } from './beta'
import { asFoundingConfig, FOUNDING_DEFAULT, type FoundingConfig } from './founding'

// ── The seeded DEFAULT values ─────────────────────────────────────────────────────────────
// They live in lib/pricing/defaults.ts, a PURE module, so the derived pricing model (pricing-grid,
// pricing-page) can read the same shape without dragging the service-role client into a client bundle.
// Re-exported here because this has always been the import site every price display reaches for.

export { PRICING_DEFAULTS } from './defaults'
export type { PricingDefaults, TierPrice } from './defaults'

// The key -> default-value map for the pricing_settings rows (matches the migration seed). The
// Phase C catalog-config keys (catalog.<item>, catalog.seat, catalog.pwyw, catalog.addon_enabled,
// ADR-463) are NOT seeded here: catalog-config.ts owns their code-default fallback per item, so an
// absent row reads the Phase B CATALOG amount. Seeding them would duplicate that source of truth.
const SETTING_DEFAULTS: Record<string, unknown> = {
  'tier.crew': PRICING_DEFAULTS.tier.crew,
  // No 'tier.supporter' default (ADR-878): Supporter is off the sellable ladder, so there is no member
  // price for it to seed. A stored row is read into the raw settings map and simply never consumed.
  'plan.business': PRICING_DEFAULTS.plan.business,
  // Collective + Independent are first-class sellable tiers (ADR-811), so they carry a default row here
  // like every other plan; an absent DB row still resolves through getPricingValues' per-key fallback.
  'plan.collective': PRICING_DEFAULTS.plan.collective,
  'plan.independent': PRICING_DEFAULTS.plan.independent,
  'plan.nonprofit': PRICING_DEFAULTS.plan.nonprofit,
  take_rate: PRICING_DEFAULTS.take_rate,
  vera_free_daily_cap: PRICING_DEFAULTS.vera_free_daily_cap,
  trial: PRICING_DEFAULTS.trial,
  annual_discount: PRICING_DEFAULTS.annual_discount,
}

/** The raw settings read: the defaults-merged map PLUS whether the DB read actually SUCCEEDED.
 *  REQUEST-CACHED. Internal — loadPricingSettings below is the public, values-only view that every
 *  price display uses. The `ok` bit exists for the one reader whose FAIL-SAFE DIRECTION depends on
 *  telling "the operator stored nothing" apart from "we could not read what the operator stored":
 *  featureGatesLive() (ADR-874) must never enforce the paid gates on the strength of a failed read.
 *  The pricing_settings table isn't in the generated types yet (ADR-246) — reached untyped. */
const readPricingSettings = cache(async (): Promise<{ values: Record<string, unknown>; ok: boolean }> => {
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS }
  try {
    const db = createAdminClient()
    const { data, error } = await (db as unknown as {
      from: (t: string) => {
        select: (c: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
      }
    })
      .from('pricing_settings')
      .select('key, value')
    if (error || !data) return { values: out, ok: false }
    for (const r of data) {
      const key = typeof r.key === 'string' ? r.key : null
      if (key && r.value != null) out[key] = r.value
    }
    return { values: out, ok: true }
  } catch {
    return { values: out, ok: false }
  }
})

/** Read ALL pricing settings as a key -> jsonb map, merged over the seeded defaults. REQUEST-CACHED;
 *  FAIL-SAFE: any error (or missing table) yields the full defaults, so prices always render. */
export const loadPricingSettings = cache(async (): Promise<Record<string, unknown>> => {
  return (await readPricingSettings()).values
})

/** The full, typed pricing values (DB merged over defaults). FAIL-SAFE to PRICING_DEFAULTS. */
export async function getPricingValues(): Promise<PricingDefaults> {
  const raw = await loadPricingSettings()
  const pick = <T>(key: string, fallback: T): T => (raw[key] != null ? (raw[key] as T) : fallback)
  return {
    tier: {
      crew: pick('tier.crew', PRICING_DEFAULTS.tier.crew),
    },
    plan: {
      business: pick('plan.business', PRICING_DEFAULTS.plan.business),
      collective: pick('plan.collective', PRICING_DEFAULTS.plan.collective),
      nonprofit: pick('plan.nonprofit', PRICING_DEFAULTS.plan.nonprofit),
      independent: pick('plan.independent', PRICING_DEFAULTS.plan.independent),
    },
    // Merge each bps field over the default so a legacy DB row (written before `free_bps` existed) still
    // resolves a free rate instead of an undefined → NaN fee. The default is the code source of truth.
    take_rate: { ...PRICING_DEFAULTS.take_rate, ...(pick('take_rate', {}) as Partial<PricingDefaults['take_rate']>) },
    vera_free_daily_cap: pick('vera_free_daily_cap', PRICING_DEFAULTS.vera_free_daily_cap),
    trial: pick('trial', PRICING_DEFAULTS.trial),
    annual_discount: pick('annual_discount', PRICING_DEFAULTS.annual_discount),
  }
}

// ── Flags (platform_flags) — the master switch + per-tier/plan + per-role gamification ────

/** Every pricing flag key (matches the migration seed). Their DEFAULTS when a row is absent. */
export const PRICING_FLAG_KEYS = [
  'billing_live',
  'tier_crew_enabled',
  // INERT (ADR-878). Supporter left the sellable ladder, so memberTierSellable('supporter') refuses
  // regardless of this flag. The key stays in the list only so the operator console keeps reading and
  // showing the stored row honestly (and so the flag read never 404s); nothing consults it to sell.
  'tier_supporter_enabled',
  'plan_business_enabled',
  'plan_nonprofit_enabled',
  // Collective ($79 list / $49 beta) + Independent ($249 white-label) sell via the loadout checkout
  // (collective_base / independent_base catalog items). Default OFF; ON + billing_live to sell (ADR-811).
  'plan_collective_enabled',
  'plan_independent_enabled',
  'gamification_full_member',
  'gamification_full_crew',
  'gamification_full_supporter',
  // Household / Circle multi-seat bundle (ADR-370, REMAINING-WORK #6). Default OFF (never sold while OFF).
  'bundle_household_enabled',
  // Operator-seat ACTIVATION (ADR-803). Default OFF = the seat stays the inert PLACEHOLDER (catalog sync
  // skips it, no Stripe price minted). Flipping it ON drops the placeholder so a re-sync mints the live
  // seat price from the operator-set amount. Never charges on its own (billingLive() still gates money).
  'catalog_operator_seat_active',
] as const

export type PricingFlagKey = (typeof PRICING_FLAG_KEYS)[number]

// Default OFF/safe for everything except the two flags that already match today's behavior (crew +
// supporter get full gamification, mirroring the derive-from-tier default).
const FLAG_DEFAULTS: Record<PricingFlagKey, boolean> = {
  billing_live: false,
  tier_crew_enabled: false,
  tier_supporter_enabled: false,
  plan_business_enabled: false,
  plan_nonprofit_enabled: false,
  plan_collective_enabled: false,
  plan_independent_enabled: false,
  gamification_full_member: false,
  gamification_full_crew: true,
  gamification_full_supporter: true,
  bundle_household_enabled: false,
  // OFF = the operator seat is a placeholder, inert until an operator activates it (ADR-362/803).
  catalog_operator_seat_active: false,
}

/** Read all pricing flags as a key -> boolean map, merged over the safe defaults. REQUEST-CACHED;
 *  FAIL-SAFE to the defaults (so billing_live reads FALSE on any error — fail closed for spend). */
export const loadPricingFlags = cache(async (): Promise<Record<PricingFlagKey, boolean>> => {
  const out: Record<PricingFlagKey, boolean> = { ...FLAG_DEFAULTS }
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('platform_flags')
      .select('key, value')
      .in('key', PRICING_FLAG_KEYS as unknown as string[])
    for (const r of data ?? []) {
      if (PRICING_FLAG_KEYS.includes(r.key as PricingFlagKey)) {
        out[r.key as PricingFlagKey] = Boolean(r.value)
      }
    }
    return out
  } catch {
    return out
  }
})

/** The master `billing_live` flag alone. FAIL-SAFE FALSE (fail closed for spend safety). */
export async function billingLiveFlag(): Promise<boolean> {
  const flags = await loadPricingFlags()
  return flags.billing_live
}

/** Is billing ACTUALLY live? The single CHARGING gate: the Stripe env keys (billingEnabled) AND the
 *  operator master switch (billing_live). OFF by default even with env keys present, so nothing charges
 *  in P1. This answers ONE question — MAY WE CHARGE / is checkout sellable — and every charging path
 *  (checkout creation, *Sellable, webhook reconciliation, dunning) checks it. FAIL-SAFE FALSE.
 *
 *  It deliberately does NOT answer "are the feature gates enforced". That is featureGatesLive() below
 *  (ADR-874); passing this into featureAllowed is the conflation that ADR fixed. */
export async function billingLive(): Promise<boolean> {
  try {
    return billingEnabled() && (await billingLiveFlag())
  } catch {
    return false
  }
}

// ── The FEATURE-GATE switch (ADR-874) — separate from the charging switch ─────────────────────────
// Selling and gating are two decisions on two dates. `billingLive()` says we may CHARGE; this says the
// paid-feature ladder actually BITES. Turning billing on to open checkout must not, in the same instant,
// revoke paid features from every free Space — members explore the levels through the beta grace window
// and start paying when it ends.

/** The `beta_grace` window config (ADR-874), merged over the code default. Kept out of the typed
 *  PricingDefaults core and read through here, exactly like getFoundingConfig / getHouseholdBundle: the
 *  settings layer already falls back to code defaults for an ABSENT key, so no migration seeds this row.
 *  FAIL-SAFE to BETA_GRACE_DEFAULT (grace ON), never to no-grace. */
export async function getBetaGrace(): Promise<BetaGraceConfig> {
  try {
    return asBetaGrace((await readPricingSettings()).values.beta_grace)
  } catch {
    return BETA_GRACE_DEFAULT
  }
}

/** Are the paid FEATURE GATES enforced right now? TRUE only when billing is live AND the beta grace
 *  window has ENDED. This is what featureAllowed / every plan-ladder wall consults — never billingLive().
 *
 *  - billing OFF                  -> false (nothing is gated; the pre-launch behavior, unchanged).
 *  - billing ON, in grace         -> false (checkout sells, every Space keeps exploring the levels).
 *  - billing ON, grace ended/none -> true  (the ladder bites).
 *
 *  FAIL-SAFE FALSE, and note the direction: false here means GRANT. A transient read error must never
 *  enforce the gates early and strip a member's or a Space's features, so any failure degrades to grace
 *  still on, matching this repo's never-lock-out posture everywhere else in pricing. (billingLive() is
 *  the opposite direction on purpose: it fails closed, because its failure mode is charging someone.) */
export async function featureGatesLive(): Promise<boolean> {
  try {
    if (!(await billingLive())) return false
    const { values, ok } = await readPricingSettings()
    // A FAILED read is not "the operator configured no grace window". Falling through to the code
    // default here would enforce the gates the moment that default date passed, on the strength of a
    // DB hiccup — the exact early lockout this fail-safe exists to prevent. Degrade to grace ON.
    if (!ok) return false
    return !betaGraceActive(asBetaGrace(values.beta_grace))
  } catch {
    return false
  }
}

/** The per-tier enable flag for a SELLABLE paid member tier (must be ON, with billing live, to SELL it).
 *  Crew is the only entry: the sellable member ladder is Member (free) and Crew (ADR-878). */
const TIER_FLAG: Record<'crew', 'tier_crew_enabled'> = {
  crew: 'tier_crew_enabled',
}

/** Is this member tier sellable right now? billingLive() AND the per-tier switch (P3). GATED — false
 *  while billing is OFF, so the upgrade surface shows a tasteful disabled "coming soon" CTA instead of
 *  a live checkout. The mirror of spacePlanSellable for personal tiers. FAIL-SAFE FALSE.
 *
 *  SUPPORTER IS ALWAYS FALSE, regardless of `tier_supporter_enabled` (ADR-878, on top of ADR-458 which
 *  retired Supporter as a tier). The parameter still ACCEPTS 'supporter' so a stale caller cannot be a
 *  type error that quietly becomes a live checkout; it refuses in code, belt and braces with the flag
 *  default being false and the SQL that turns the prod flag off. Nothing sells Supporter again without
 *  deleting this branch on purpose. */
export async function memberTierSellable(tier: 'crew' | 'supporter'): Promise<boolean> {
  if (tier === 'supporter') return false
  try {
    if (!(await billingLive())) return false
    const flags = await loadPricingFlags()
    return flags[TIER_FLAG[tier]] === true
  } catch {
    return false
  }
}

/** The Household / Circle bundle config (ADR-370, REMAINING-WORK #6), merged over the seeded default.
 *  FAIL-SAFE to HOUSEHOLD_BUNDLE_DEFAULT. The bundle config is not in PricingDefaults (it keeps the typed
 *  core stable); read it through here. */
export async function getHouseholdBundle(): Promise<HouseholdBundleConfig> {
  try {
    const raw = await loadPricingSettings()
    return asHouseholdBundleConfig(raw.household_bundle)
  } catch {
    return HOUSEHOLD_BUNDLE_DEFAULT
  }
}

/** Is the Household / Circle bundle sellable right now? billingLive() AND bundle_household_enabled.
 *  GATED — FALSE while billing is OFF, so the bundle is never sold and no member is seated. The mirror
 *  of memberTierSellable / spacePlanSellable for the bundle. FAIL-SAFE FALSE. */
export async function bundleSellable(): Promise<boolean> {
  try {
    if (!(await billingLive())) return false
    const flags = await loadPricingFlags()
    return flags.bundle_household_enabled === true
  } catch {
    return false
  }
}

/** The Founders Round + Founding Businesses rate config (ADR-599), merged over the seeded default.
 *  FAIL-SAFE to FOUNDING_DEFAULT. Like getHouseholdBundle, this is kept out of the typed PricingDefaults
 *  core and read through here (a founding rate is a locked display value, never a live charge — nothing
 *  here charges; the money flip is gated by billingLive()). Read via the 'founding' pricing_settings key. */
export async function getFoundingConfig(): Promise<FoundingConfig> {
  try {
    const raw = await loadPricingSettings()
    return asFoundingConfig(raw.founding)
  } catch {
    return FOUNDING_DEFAULT
  }
}

// ── Writes (service-role; call ONLY from admin-gated server actions) ──────────────────────
// authz-delegated: setPricingSetting is a caller-trusted operator-config write (ADR-274) with no
// per-caller scope by design (pricing values are platform-wide config); authorization lives at its
// only call sites, the janitor-gated /admin/pricing actions (each calls requireAdmin('janitor')).

/** Upsert a pricing_settings VALUE (jsonb). Service-role; the admin pricing actions gate the
 *  caller. Throws on a DB error so the action can surface it. */
export async function setPricingSetting(key: string, value: unknown, changedBy?: string | null): Promise<void> {
  const db = createAdminClient()
  const { error } = await (db as unknown as {
    from: (t: string) => {
      upsert: (v: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>
    }
  })
    .from('pricing_settings')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: changedBy ?? null })
  if (error) throw new Error(error.message ?? 'Could not save pricing setting.')
}
