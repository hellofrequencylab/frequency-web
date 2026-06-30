'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'
import { setPricingSetting, type TierPrice } from '@/lib/pricing/settings'
import {
  catalogConfigKey,
  SEAT_CONFIG_KEY,
  PWYW_CONFIG_KEY,
  ADDON_ENABLED_KEY,
  type CatalogItemConfig,
  type SeatConfig,
  type PwywConfig,
} from '@/lib/pricing/catalog-config'
import { asCatalogItemKey } from '@/lib/billing/pricing-keys'
import { ADDON_KEYS, asAddonKey } from '@/lib/pricing/plans'
import { setFeatureGateOverride } from '@/lib/pricing/gates'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingEnabled } from '@/lib/billing/stripe'
import { syncPricingCatalogToStripe, syncPricingProductsToStripe } from '@/lib/billing/pricing-products'
import { ok, fail, type ActionResult } from '@/lib/action-result'

// Operator writes for /admin/pricing (ADR-362, docs/PRICING.md). EVERYTHING SHIPS OFF: these only
// edit operator config (prices, gates, switches); nothing charges and no Stripe call is made in P1.
// Janitor-gated (matching the page + sections.ts entry); every flip is audited via setPlatformFlag.

const PATH = '/admin/pricing'

/** Set a pricing platform flag (master billing_live, per-tier/plan enable, per-role gamification).
 *  Janitor-only; audited in platform_flag_events. */
export async function setPricingFlag(key: string, value: boolean): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  try {
    await setPlatformFlag(key, value, { changedBy: ctx.profileId, source: 'admin' })
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the switch.')
  }
}

/** Save a tier/plan PRICE (monthly/annual cents, optional setup cents). The key is one of
 *  'tier.crew' | 'tier.supporter' | 'plan.practitioner' | 'plan.business' | 'plan.organization' |
 *  'plan.whitelabel'. Values are non-negative integer cents; null annual = monthly-only. */
export async function savePrice(key: string, price: TierPrice): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const monthly = Math.max(0, Math.round(Number(price.monthly_cents) || 0))
  const annual = price.annual_cents == null ? null : Math.max(0, Math.round(Number(price.annual_cents) || 0))
  const value: TierPrice = { monthly_cents: monthly, annual_cents: annual }
  if (price.setup_cents != null) value.setup_cents = Math.max(0, Math.round(Number(price.setup_cents) || 0))
  // The optional MONTHLY list anchor (ADR-463): the crossed-out price the founding monthly sits under.
  if (price.list_cents != null) value.list_cents = Math.max(0, Math.round(Number(price.list_cents) || 0))
  try {
    await setPricingSetting(key, value, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the price.')
  }
}

// ── PHASE C: the CLEAN catalog editor (ADR-463) ───────────────────────────────────────────────────
// Each catalog item (Pro base + the four add-ons + nonprofit seat + organization) carries a MONTHLY
// list + founding amount, with the yearly derived two-months-free (or an explicit yearly override).
// Persisted to pricing_settings under catalog.<item>; catalog-config.ts reads it fail-safe over the
// Phase B code default. Plus the seat bundled floor, the Supporter PWYW config, and the per-add-on
// enable map. Janitor-gated; nothing charges (config only, billing OFF).

const nonNegCents = (v: unknown) => Math.max(0, Math.round(Number(v) || 0))

/** Save one catalog item's amount config (monthly list + founding, optional yearly overrides). The key
 *  is a CatalogItemKey (pro_base / addon_* / nonprofit_seat / organization). */
export async function saveCatalogItem(item: string, config: CatalogItemConfig): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const key = asCatalogItemKey(item)
  if (!key) return fail('Unknown catalog item.')
  const value: CatalogItemConfig = {
    monthlyListCents: nonNegCents(config.monthlyListCents),
    monthlyFoundingCents: nonNegCents(config.monthlyFoundingCents),
    yearlyListCents: config.yearlyListCents == null ? null : nonNegCents(config.yearlyListCents),
    yearlyFoundingCents: config.yearlyFoundingCents == null ? null : nonNegCents(config.yearlyFoundingCents),
  }
  try {
    await setPricingSetting(catalogConfigKey(key), value, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the catalog item.')
  }
}

/** Save the seat bundled floor (the minimum licensed seats a seat plan bills). */
export async function saveSeatConfig(seat: SeatConfig): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const value: SeatConfig = { bundledFloor: Math.max(1, Math.round(Number(seat.bundledFloor) || 1)) }
  try {
    await setPricingSetting(SEAT_CONFIG_KEY, value, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the seat config.')
  }
}

/** Save the Supporter pay-what-you-want config (minimum + suggested). The suggested is clamped to at
 *  least the minimum so the surface never suggests below the floor. */
export async function savePwywConfig(pwyw: PwywConfig): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const min = nonNegCents(pwyw.minCents)
  const value: PwywConfig = { minCents: min, suggestedCents: Math.max(min, nonNegCents(pwyw.suggestedCents)) }
  try {
    await setPricingSetting(PWYW_CONFIG_KEY, value, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the Supporter config.')
  }
}

/** Toggle whether a Pro add-on is offered on the picker (the per-add-on enable map). Persisted as the
 *  whole map so a partial write never drops the other add-ons. */
export async function saveAddonEnabled(addon: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const key = asAddonKey(addon)
  if (!key) return fail('Unknown add-on.')
  try {
    // Read-modify-write the whole map (default-all-enabled), so we never drop an unmentioned add-on.
    const { loadCatalogConfig } = await import('@/lib/pricing/catalog-config')
    const current = (await loadCatalogConfig()).addonEnabled
    // Write target is ALWAYS a trusted key from the ADDON_KEYS constant (never the user-supplied
    // `key`, which is only compared) so a property name can never be injected from input. `key` is
    // already validated by asAddonKey above; this keeps the write provably safe to static analysis.
    const next: Record<string, boolean> = {}
    for (const k of ADDON_KEYS) next[k] = k === key ? enabled : current[k]
    await setPricingSetting(ADDON_ENABLED_KEY, next, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the add-on switch.')
  }
}

/** Save the take-rate (basis points per plan). */
export async function saveTakeRate(rate: {
  practitioner_bps: number
  business_bps: number
  organization_bps: number
}): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const clamp = (n: unknown) => Math.min(10000, Math.max(0, Math.round(Number(n) || 0)))
  try {
    await setPricingSetting(
      'take_rate',
      {
        practitioner_bps: clamp(rate.practitioner_bps),
        business_bps: clamp(rate.business_bps),
        organization_bps: clamp(rate.organization_bps),
      },
      ctx.profileId,
    )
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the take-rate.')
  }
}

/** Save the Vera free daily cap, trial days, and annual discount (months free). */
export async function saveKnobs(knobs: {
  vera_messages: number
  trial_days: number
  annual_months_free: number
}): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0))
  try {
    await Promise.all([
      setPricingSetting('vera_free_daily_cap', { messages: n(knobs.vera_messages) }, ctx.profileId),
      setPricingSetting('trial', { days: n(knobs.trial_days) }, ctx.profileId),
      setPricingSetting('annual_discount', { months_free: n(knobs.annual_months_free) }, ctx.profileId),
    ])
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save.')
  }
}

/** Save a feature-gate override (min_entitlement and/or enabled). */
export async function saveFeatureGate(
  feature: string,
  patch: { minEntitlement?: string; enabled?: boolean },
): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  try {
    await setFeatureGateOverride(feature, patch, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the feature gate.')
  }
}

/** Sync the Stripe Products/Prices from the current pricing values (Pricing P2, ADR-363). Janitor-
 *  gated; ONLY runs when the Stripe env keys are present (billingEnabled) — never makes a Stripe call
 *  otherwise. Creates/updates one Product per tier + monthly/annual Prices (idempotent) and writes the
 *  resolved ids into pricing_stripe_prices. Returns a per-key summary for the surface. */
export async function syncStripeProducts(): Promise<
  ActionResult<{ synced: number; errors: { key: string; message: string }[] }>
> {
  const ctx = await requireAdmin('janitor')
  if (!billingEnabled()) return fail('Connect Stripe first. Set the Stripe env keys, then sync.')
  try {
    const res = await syncPricingProductsToStripe(ctx.profileId)
    revalidatePath(PATH)
    if (!res.ok && res.synced.length === 0) {
      return fail(res.errors[0]?.message ?? 'Could not sync products to Stripe.')
    }
    return ok({ synced: res.synced.length, errors: res.errors })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not sync products to Stripe.')
  }
}

/** Sync the CLEAN Phase B catalog to Stripe (Pricing ladder Phase B, ADR-460): one Product per catalog
 *  item (Pro base + the four add-ons + nonprofit seat + organization), each with its list + founding x
 *  month + year Prices, and archive the retired legacy keys. Janitor-gated; ONLY runs when the Stripe
 *  env keys are present (billingEnabled), never a Stripe call otherwise. Idempotent. Returns a per-key
 *  summary for the surface (Phase C wires the button). */
export async function syncStripeCatalog(): Promise<
  ActionResult<{ synced: number; errors: { key: string; message: string }[] }>
> {
  const ctx = await requireAdmin('janitor')
  if (!billingEnabled()) return fail('Connect Stripe first. Set the Stripe env keys, then sync.')
  try {
    const res = await syncPricingCatalogToStripe(ctx.profileId)
    revalidatePath(PATH)
    if (!res.ok && res.synced.length === 0) {
      return fail(res.errors[0]?.message ?? 'Could not sync the catalog to Stripe.')
    }
    return ok({ synced: res.synced.length, errors: res.errors })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not sync the catalog to Stripe.')
  }
}

/** Toggle the founding-member lock on a profile by member id (display + lock in P1; honored at
 *  checkout in P2). Sets is_founding_member; clears locked_price_id when turned off. */
export async function setFoundingMember(profileId: string, value: boolean): Promise<ActionResult> {
  await requireAdmin('janitor')
  const id = profileId.trim()
  if (!id) return fail('Enter a member id.')
  // Validate the shape (SEC-8) — match the uuid checks economy/spotlight use.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail('Enter a valid member id.')
  }
  try {
    const db = createAdminClient()
    const patch: Record<string, unknown> = { is_founding_member: value }
    if (!value) patch.locked_price_id = null
    const { error } = await (db as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: { message?: string } | null }> }
      }
    })
      .from('profiles')
      .update(patch)
      .eq('id', id)
    if (error) return fail(error.message ?? 'Could not update the member.')
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the member.')
  }
}
