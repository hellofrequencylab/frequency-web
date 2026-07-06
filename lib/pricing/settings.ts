// PRICING SETTINGS + FLAGS — the operator-editable VALUES (prices, take-rates, caps, trial,
// annual discount) and the on/off switches that govern billing. Server-only (service-role reads),
// FAIL-SAFE: every read falls back to the seeded code defaults so a transient DB hiccup, or the
// pre-migration state, never breaks a price display or wrongly turns billing on.
//
// EVERYTHING SHIPS OFF (ADR-362, docs/PRICING.md). The LIVE gate is `billingLive()` =
// billingEnabled() (the Stripe env keys, lib/billing/stripe.ts) AND the `billing_live` platform
// flag — so even a fully configured Stripe env stays OFF until an operator flips the master switch.
//
// The values mirror the migration seed exactly; this module is the code source of truth for the
// DEFAULTS (the table only overrides them), the same contract gates.ts / page-chrome.ts use.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingEnabled } from '@/lib/billing/stripe'
import {
  asHouseholdBundleConfig,
  HOUSEHOLD_BUNDLE_DEFAULT,
  type HouseholdBundleConfig,
} from './bundle'

// ── The seeded DEFAULT values (kept in sync with 20260723010000_pricing_foundation.sql) ──
// Prices in CENTS. annual ≈ 2 months free (the spec). Business + Nonprofit both offer monthly + annual
// (ADR-552). These are the launch-target values; all editable at /admin/pricing.

export interface TierPrice {
  monthly_cents: number
  annual_cents: number | null
  /** Optional one-time setup fee in cents (legacy; retained for read-safe resolution of old rows). */
  setup_cents?: number
  /** Optional MONTHLY list anchor in cents (ADR-463): the crossed-out price the founding `monthly_cents`
   *  sits under (e.g. Crew list $12, founding $9). Absent = no anchor (the monthly is shown plainly). */
  list_cents?: number
}

export interface PricingDefaults {
  tier: { crew: TierPrice; supporter: TierPrice }
  plan: {
    business: TierPrice
    nonprofit: TierPrice
  }
  /** Take-rate per plan, in basis points (500 = 5%). Business + Nonprofit only (ADR-552). */
  take_rate: { business_bps: number; nonprofit_bps: number }
  /** Vera free-tier daily message cap. */
  vera_free_daily_cap: { messages: number }
  trial: { days: number }
  annual_discount: { months_free: number }
}

export const PRICING_DEFAULTS: PricingDefaults = {
  tier: {
    crew: { monthly_cents: 900, annual_cents: 9000, list_cents: 1200 }, // $9 founding under a $12 list (ADR-463)
    supporter: { monthly_cents: 2400, annual_cents: 24000 }, // $24 / $240 (retired tier; kept for legacy resolve)
  },
  plan: {
    business: { monthly_cents: 4900, annual_cents: 49000 }, // $49 / $490
    nonprofit: { monthly_cents: 2900, annual_cents: 29000 }, // $29 / $290 (verified 501c3)
  },
  take_rate: { business_bps: 500, nonprofit_bps: 300 },
  vera_free_daily_cap: { messages: 10 },
  trial: { days: 14 }, // 14-day free trial on Space plans (card upfront; members get none, the free tier is their trial)
  annual_discount: { months_free: 2 },
}

// The key -> default-value map for the pricing_settings rows (matches the migration seed). The
// Phase C catalog-config keys (catalog.<item>, catalog.seat, catalog.pwyw, catalog.addon_enabled,
// ADR-463) are NOT seeded here: catalog-config.ts owns their code-default fallback per item, so an
// absent row reads the Phase B CATALOG amount. Seeding them would duplicate that source of truth.
const SETTING_DEFAULTS: Record<string, unknown> = {
  'tier.crew': PRICING_DEFAULTS.tier.crew,
  'tier.supporter': PRICING_DEFAULTS.tier.supporter,
  'plan.business': PRICING_DEFAULTS.plan.business,
  'plan.nonprofit': PRICING_DEFAULTS.plan.nonprofit,
  take_rate: PRICING_DEFAULTS.take_rate,
  vera_free_daily_cap: PRICING_DEFAULTS.vera_free_daily_cap,
  trial: PRICING_DEFAULTS.trial,
  annual_discount: PRICING_DEFAULTS.annual_discount,
}

/** Read ALL pricing settings as a key -> jsonb map, merged over the seeded defaults. REQUEST-CACHED;
 *  FAIL-SAFE: any error (or missing table) yields the full defaults, so prices always render. The
 *  pricing_settings table isn't in the generated types yet (ADR-246) — reached untyped. */
export const loadPricingSettings = cache(async (): Promise<Record<string, unknown>> => {
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
    if (error || !data) return out
    for (const r of data) {
      const key = typeof r.key === 'string' ? r.key : null
      if (key && r.value != null) out[key] = r.value
    }
    return out
  } catch {
    return out
  }
})

/** The full, typed pricing values (DB merged over defaults). FAIL-SAFE to PRICING_DEFAULTS. */
export async function getPricingValues(): Promise<PricingDefaults> {
  const raw = await loadPricingSettings()
  const pick = <T>(key: string, fallback: T): T => (raw[key] != null ? (raw[key] as T) : fallback)
  return {
    tier: {
      crew: pick('tier.crew', PRICING_DEFAULTS.tier.crew),
      supporter: pick('tier.supporter', PRICING_DEFAULTS.tier.supporter),
    },
    plan: {
      business: pick('plan.business', PRICING_DEFAULTS.plan.business),
      nonprofit: pick('plan.nonprofit', PRICING_DEFAULTS.plan.nonprofit),
    },
    take_rate: pick('take_rate', PRICING_DEFAULTS.take_rate),
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
  'tier_supporter_enabled',
  'plan_business_enabled',
  'plan_nonprofit_enabled',
  'gamification_full_member',
  'gamification_full_crew',
  'gamification_full_supporter',
  // Household / Circle multi-seat bundle (ADR-370, REMAINING-WORK #6). Default OFF (never sold while OFF).
  'bundle_household_enabled',
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
  gamification_full_member: false,
  gamification_full_crew: true,
  gamification_full_supporter: true,
  bundle_household_enabled: false,
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

/** Is billing ACTUALLY live? The single gate: the Stripe env keys (billingEnabled) AND the
 *  operator master switch (billing_live). OFF by default even with env keys present, so nothing
 *  charges in P1. Every charging/gating path checks this — and while it's false, featureAllowed
 *  grants everything (today's behavior). FAIL-SAFE FALSE. */
export async function billingLive(): Promise<boolean> {
  try {
    return billingEnabled() && (await billingLiveFlag())
  } catch {
    return false
  }
}

/** The per-tier enable flag for a paid member tier (must be ON, with billing live, to SELL it). */
const TIER_FLAG: Record<'crew' | 'supporter', 'tier_crew_enabled' | 'tier_supporter_enabled'> = {
  crew: 'tier_crew_enabled',
  supporter: 'tier_supporter_enabled',
}

/** Is this member tier sellable right now? billingLive() AND the per-tier switch (P3). GATED — false
 *  while billing is OFF, so the upgrade surface shows a tasteful disabled "coming soon" CTA instead of
 *  a live checkout. The mirror of spacePlanSellable for personal tiers. FAIL-SAFE FALSE. */
export async function memberTierSellable(tier: 'crew' | 'supporter'): Promise<boolean> {
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
