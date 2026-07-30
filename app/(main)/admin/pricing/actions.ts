'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag, setPlatformSetting } from '@/lib/platform-flags'
import {
  setPricingSetting,
  getFoundingConfig,
  getPricingValues,
  type TierPrice,
  type PricingDefaults,
} from '@/lib/pricing/settings'
import { sanitizeFoundingConfig, type FoundingConfig } from '@/lib/pricing/founding'
import {
  asPwywConfig,
  catalogConfigKey,
  loadCatalogConfig,
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
 *  'tier.crew' | 'plan.practitioner' | 'plan.business' | 'plan.organization' | 'plan.whitelabel'.
 *  Values are non-negative integer cents; null annual = monthly-only. 'tier.crew' is the only MEMBER
 *  price: Supporter left the sellable ladder (ADR-878) and the console offers no row for it. */
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

/** Save the pay-what-you-want floor + suggested amount (the Crew membership picker and the one-time
 *  Supporter contribution share this config). The suggested is clamped to at least the minimum so the
 *  surface never suggests below the floor.
 *
 *  This console edits only those TWO fields, so it MERGES over the stored config rather than replacing
 *  it: writing a bare `{ minCents, suggestedCents }` would silently drop the operator's ceiling and
 *  preset amounts and reset the picker to the code defaults. `asPwywConfig` then re-clamps the whole
 *  merged shape, so a raised floor automatically drops any preset that fell below it. */
export async function savePwywConfig(
  pwyw: Pick<PwywConfig, 'minCents' | 'suggestedCents'>,
): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const min = nonNegCents(pwyw.minCents)
  try {
    const current = (await loadCatalogConfig()).pwyw
    const value: PwywConfig = asPwywConfig({
      ...current,
      minCents: min,
      suggestedCents: Math.max(min, nonNegCents(pwyw.suggestedCents)),
    })
    await setPricingSetting(PWYW_CONFIG_KEY, value, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the pay-what-you-want config.')
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

/** The network-tier keys the console may edit, as a TRUSTED constant. Every write target below comes from
 *  this list, never from a caller-supplied property name. `independent` is deliberately editable too (it
 *  is part of the stored vector), but the console does not render it: a disconnected Space has left the
 *  graph, so its network revenue is 0 by definition. */
const NETWORK_TIER_KEYS = ['free', 'business', 'collective', 'nonprofit', 'independent'] as const

/** Save the take-rate, in basis points (800 = 8%). Writes the fields that ACTUALLY CHARGE (ADR-913):
 *  `network_bps` (the per-Space-tier network-sourced vector `spaceTakeRateCents` reads) and `member_bps`
 *  (the individual Crew seller rung `memberTakeRateCents` reads). A sale to the seller's own audience is
 *  0% by rule and is not a stored rate; tips carry no fee at all.
 *
 *  READ-MODIFY-WRITE, and that is load-bearing: `setPricingSetting` REPLACES the whole `take_rate` jsonb
 *  value, so writing a bare object is a silent delete of every field omitted. The previous version of this
 *  action wrote only the four legacy flat fields, which (a) dropped the stored `network_bps` vector
 *  entirely and (b) meant an operator edited numbers that never reached a charge. Merging over the current
 *  values keeps the legacy flat trio and any tier this console does not render. */
export async function saveTakeRate(rate: {
  member_bps: number
  network_bps: Partial<PricingDefaults['take_rate']['network_bps']>
}): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const clamp = (n: unknown) => Math.min(10000, Math.max(0, Math.round(Number(n) || 0)))
  try {
    const current = (await getPricingValues()).take_rate
    const network = { ...current.network_bps }
    for (const tier of NETWORK_TIER_KEYS) {
      const next = rate.network_bps[tier]
      if (next != null) network[tier] = clamp(next)
    }
    const value: PricingDefaults['take_rate'] = {
      ...current,
      member_bps: clamp(rate.member_bps),
      network_bps: network,
    }
    await setPricingSetting('take_rate', value, ctx.profileId)
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

/** Save the `founding` config (ADR-599/803): the one-time Founding MEMBER rate + cap, and the Founding
 *  BUSINESS locked monthly rate + bought-down take-rate + per-city cap. Janitor-gated; persisted to the
 *  `founding` pricing_settings key. sanitizeFoundingConfig narrows every field fail-safe to the default
 *  and clamps the take-rate to at most 100%, so a garbage/partial input can never store an impossible
 *  value. Nothing charges (ADR-362): a founding rate is a locked display value; the money flip is
 *  billingLive(). Amounts in cents, the take-rate in basis points (300 = 3%). */
export async function saveFoundingConfig(config: Partial<FoundingConfig>): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  try {
    // READ-MODIFY-WRITE: merge the changed fields OVER the current stored config, so a row that
    // sends only its own fields (the member row vs the business row) never overwrites the other
    // row's fields with a stale client snapshot. Two operators — or one operator saving both rows
    // back-to-back before revalidation propagates — can no longer clobber each other (ADR-803).
    const current = await getFoundingConfig()
    const value = sanitizeFoundingConfig({ ...current, ...config })
    await setPricingSetting('founding', value, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the founding config.')
  }
}

/** Set the operator-seat ACTIVATION switch (ADR-803, platform flag `catalog_operator_seat_active`).
 *  OFF (default) keeps the seat an inert placeholder the catalog sync skips; ON drops the placeholder so
 *  the next sync mints the live seat price from the operator-set amount. Janitor-gated; audited in
 *  platform_flag_events via setPlatformFlag. Nothing charges on its own (billingLive() still gates money). */
export async function setOperatorSeatActive(value: boolean): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  try {
    await setPlatformFlag('catalog_operator_seat_active', value, { changedBy: ctx.profileId, source: 'admin' })
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the switch.')
  }
}

// ── Beta controls (ADR-803) ─────────────────────────────────────────────────────────────────────
// The three beta switches that were database-only: the invite gate, the host-prompt surface, and the
// countdown clock. The two booleans are audited platform flags; the countdown is a text setting and is
// DISPLAY-ONLY (it grants no access — it only feeds the countdown banner). Janitor-gated.

/** The beta boolean flags editable here (default-deny: any other key is rejected). */
const BETA_FLAG_KEYS = ['beta_invite_only', 'beta_host_prompts'] as const
type BetaFlagKey = (typeof BETA_FLAG_KEYS)[number]

/** Set a beta boolean flag (`beta_invite_only` invite gate, `beta_host_prompts` feed nudges). Janitor-
 *  gated; audited in platform_flag_events via setPlatformFlag. */
export async function setBetaFlag(key: string, value: boolean): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  if (!(BETA_FLAG_KEYS as readonly string[]).includes(key)) return fail('Unknown beta switch.')
  try {
    await setPlatformFlag(key as BetaFlagKey, value, { changedBy: ctx.profileId, source: 'admin' })
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the switch.')
  }
}

/** Save the BETA GRACE date (`beta_grace` pricing_settings, ADR-874): the day the paid FEATURE GATES
 *  start blocking. This is the second of the two switches — `billing_live` decides whether we may
 *  CHARGE, this decides whether the paid ladder BITES — so turning billing on to sell plans no longer
 *  revokes paid features from every free Space in the same instant.
 *
 *  Accepts a calendar date ('2026-09-01'; stored as-is, read as 00:00 UTC on that day, so the date is
 *  the first ENFORCED day) or an empty string, which stores `{ until: null }` = no grace window, i.e.
 *  the gates follow `billing_live` exactly. Janitor-gated; unlike saveBetaEndsAt this one DOES change
 *  access, so it rejects an unparseable value rather than storing it. */
export async function saveBetaGrace(value: string): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const raw = value.trim()
  if (raw && Number.isNaN(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw))) {
    return fail('Enter a valid date (for example 2026-09-01).')
  }
  try {
    await setPricingSetting('beta_grace', { until: raw || null }, ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the date.')
  }
}

/** Save the beta countdown date (`beta_ends_at`, platform_settings text). DISPLAY-ONLY: it drives the
 *  countdown banner and nothing else — it grants no access. Accepts an empty string (clears the banner)
 *  or a parseable date (stored as an ISO string). Janitor-gated. */
export async function saveBetaEndsAt(value: string): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  const raw = value.trim()
  if (!raw) {
    try {
      await setPlatformSetting('beta_ends_at', '', ctx.profileId)
      revalidatePath(PATH)
      return ok()
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Could not save the date.')
    }
  }
  const ms = Date.parse(raw)
  if (Number.isNaN(ms)) return fail('Enter a valid date (for example 2026-09-01).')
  try {
    await setPlatformSetting('beta_ends_at', new Date(ms).toISOString(), ctx.profileId)
    revalidatePath(PATH)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the date.')
  }
}
