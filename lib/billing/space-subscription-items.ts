// SPACE SUBSCRIPTION ITEMS (Pricing ladder Phase B, ADR-460). The bridge between a Stripe
// subscription's ITEMS and a Space's plan + billing-managed entitlements. A Space buys Pro as ONE
// subscription with MULTIPLE items (a base item plus one item per active add-on; seat items carry a
// quantity). This module:
//   1. PURE: maps the set of subscription item keys -> the base plan + the active AddonKey set the
//      resolver consumes (setSpaceAddons set-to-target). Unit-testable without Stripe/Supabase.
//   2. IO: persists each item into space_subscription_items (incl. the grandfathered locked_price_id,
//      interval, quantity), and a helper to read a Space's locked price for an item (so a renewal
//      re-bills the founding price, not the current list price).
//
// THE FOUNDING-PRICE GRANDFATHER (generalizing profiles.locked_price_id / ADR-363 to space items): the
// concrete Stripe price id charged at first subscribe is recorded as the item's locked_price_id; a
// renewal / add-on toggle re-bills THAT id, not the current list price. A subscription lapse clears the
// lock (the item row is canceled/removed); a fresh subscribe pays the then-current founding price.
//
// Server-only for the IO halves (admin client). The pure mapping is import-safe anywhere.

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { asAddonKey, type AddonKey, type SpacePlan } from '@/lib/pricing/plans'
import {
  asCatalogItemKey,
  addonKeyForCatalogItem,
  type BillingInterval,
} from './pricing-keys'

// ── The per-item DB row item_key namespace (the space_subscription_items.item_key CHECK) ──────────
// The base plan item is 'base' (Pro/Nonprofit/Org core); the four add-ons keep their short keys
// (marketing/ai/team/branding); the seat + org items carry their own keys. This is the DB-level key,
// distinct from the catalog item key (pro_base maps to 'base'; addon_marketing maps to 'marketing').
export const ITEM_KEYS = [
  'base',
  'marketing',
  'ai',
  'team',
  'branding',
  'nonprofit_seat',
  'organization',
] as const

export type ItemKey = (typeof ITEM_KEYS)[number]

/** Narrow an arbitrary value to a known DB item_key, or null (default-deny). PURE. */
export function asItemKey(raw: string | null | undefined): ItemKey | null {
  return (ITEM_KEYS as readonly string[]).includes(raw ?? '') ? (raw as ItemKey) : null
}

/** The DB item_key for a catalog item key (pro_base -> base; addon_marketing -> marketing; the rest
 *  map 1:1). PURE. Returns null for an unknown catalog key. */
export function itemKeyForCatalogKey(catalogKey: string | null | undefined): ItemKey | null {
  const key = asCatalogItemKey(catalogKey)
  if (!key) return null
  if (key === 'pro_base') return 'base'
  const addon = addonKeyForCatalogItem(key)
  if (addon) return addon
  // nonprofit_seat / organization map 1:1.
  return asItemKey(key)
}

/** A reconciled subscription item: the DB item_key plus the per-item fields the row persists. */
export interface ReconciledItem {
  itemKey: ItemKey
  stripeSubscriptionItemId: string | null
  quantity: number
  interval: BillingInterval
  /** The grandfathered price id charged for this item (the founding price). */
  lockedPriceId: string | null
}

/** The base plan a set of item keys implies. PURE. An 'organization' item -> organization; a
 *  'nonprofit_seat' item -> nonprofit; otherwise (a 'base' item, with or without add-ons) -> pro; an
 *  empty set -> free. Organization/Nonprofit out-rank Pro (they are all-inclusive). */
export function planForItemKeys(itemKeys: readonly ItemKey[]): SpacePlan {
  if (itemKeys.includes('organization')) return 'organization'
  if (itemKeys.includes('nonprofit_seat')) return 'nonprofit'
  if (itemKeys.includes('base')) return 'pro'
  return 'free'
}

/** The active AddonKey set a set of item keys implies (the add-on items only). PURE. Deduped. The
 *  resolver (setSpaceAddons) unions these onto the base plan's core to set-to-target the billing
 *  namespace. Nonprofit/Organization are all-inclusive, so their add-ons are implied by the plan, not
 *  this set, but returning the add-on items present is harmless (the union is well-defined). */
export function addonsForItemKeys(itemKeys: readonly ItemKey[]): AddonKey[] {
  const out = new Set<AddonKey>()
  for (const key of itemKeys) {
    const addon = asAddonKey(key) // marketing/ai/team/branding narrow to AddonKey; base/seat/org -> null
    if (addon) out.add(addon)
  }
  return [...out]
}

/** Map a Stripe subscription's line items to the reconciled DB items. PURE-ish (reads only the Stripe
 *  object). Resolves each item's DB item_key from the price's metadata catalog key (set at sync), the
 *  charged price id (the grandfathered locked price), the interval, and the quantity. Items whose price
 *  carries no recognized catalog key are skipped (a stray line item never forges an entitlement). */
export function reconciledItemsFromSubscription(sub: Stripe.Subscription): ReconciledItem[] {
  const out: ReconciledItem[] = []
  for (const line of sub.items?.data ?? []) {
    const price = line.price
    const catalogKey = price?.metadata?.frequency_pricing_key ?? null
    // The catalog price key is `<item>_<interval>` (founding) or `<item>_<interval>_list`; the item
    // portion is everything before the trailing interval (+ optional _list). Resolve via the catalog.
    const itemKey = itemKeyForCatalogKey(stripItemPortion(catalogKey))
    if (!itemKey) continue
    const interval: BillingInterval = price?.recurring?.interval === 'year' ? 'year' : 'month'
    out.push({
      itemKey,
      stripeSubscriptionItemId: typeof line.id === 'string' ? line.id : null,
      quantity: typeof line.quantity === 'number' && line.quantity > 0 ? line.quantity : 1,
      interval,
      lockedPriceId: typeof price?.id === 'string' ? price.id : null,
    })
  }
  return out
}

/** Strip the trailing `_<interval>` (and optional `_list`) from a catalog price key to recover the
 *  catalog item key. PURE. e.g. 'pro_base_month' -> 'pro_base'; 'addon_marketing_year_list' ->
 *  'addon_marketing'; 'nonprofit_seat_month' -> 'nonprofit_seat'. Returns the input unchanged if it
 *  does not match (asCatalogItemKey then rejects it). */
export function stripItemPortion(priceKey: string | null | undefined): string | null {
  if (!priceKey) return null
  return priceKey.replace(/_(month|year)(_list)?$/, '')
}

// ── IO: persist the reconciled items + read a Space's locked price ────────────────────────────────

/** Persist the reconciled items for a Space into space_subscription_items: UPSERT each present item
 *  (keyed on space_id + item_key) and mark every other item CANCELED (so a toggled-off add-on's row no
 *  longer reads active). Service-role; the signed webhook authorizes. The table is not in the generated
 *  types yet (ADR-246), reached untyped. FAIL-SAFE: swallows errors (the entitlement write via
 *  setSpaceAddons is the authority; this table is the audit/reference mirror). */
export async function persistSpaceSubscriptionItems(
  spaceId: string,
  items: readonly ReconciledItem[],
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'pending',
): Promise<void> {
  try {
    const db = createAdminClient()
    const writer = db as unknown as {
      from: (t: string) => {
        upsert: (v: Record<string, unknown>, o?: Record<string, unknown>) => Promise<{ error: unknown }>
        update: (v: Record<string, unknown>) => {
          eq: (c: string, val: string) => { not: (c2: string, op: string, vals: string) => Promise<{ error: unknown }> }
        }
      }
    }
    const now = new Date().toISOString()
    const presentKeys: string[] = []
    for (const item of items) {
      presentKeys.push(item.itemKey)
      await writer.from('space_subscription_items').upsert(
        {
          space_id: spaceId,
          item_key: item.itemKey,
          stripe_subscription_item_id: item.stripeSubscriptionItemId,
          status,
          quantity: item.quantity,
          interval: item.interval,
          locked_price_id: item.lockedPriceId,
          updated_at: now,
        },
        { onConflict: 'space_id,item_key' },
      )
    }
    // Mark every item NOT in the present set canceled (a toggled-off add-on / a lapsed subscription).
    const keepList = `(${presentKeys.map((k) => `"${k}"`).join(',') || '""'})`
    await writer
      .from('space_subscription_items')
      .update({ status: 'canceled', updated_at: now })
      .eq('space_id', spaceId)
      .not('item_key', 'in', keepList)
  } catch {
    // Swallow: the entitlement write (setSpaceAddons) is the source of truth; this mirror is best-effort.
  }
}

/** Read a Space's grandfathered locked price id for a given DB item_key (or null when none/lapsed).
 *  The checkout path re-bills this id so a founding subscriber keeps their founding rate on a renewal /
 *  add-on toggle. Service-role; FAIL-SAFE to null (no lock -> pay the current price). */
export async function readLockedPriceId(spaceId: string, itemKey: ItemKey): Promise<string | null> {
  try {
    const db = createAdminClient()
    const { data } = (await (db as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c1: string, v1: string) => {
            eq: (c2: string, v2: string) => { maybeSingle: () => Promise<{ data: unknown }> }
          }
        }
      }
    })
      .from('space_subscription_items')
      .select('locked_price_id, status')
      .eq('space_id', spaceId)
      .eq('item_key', itemKey)
      .maybeSingle()) as { data: { locked_price_id?: string | null; status?: string } | null }
    if (!data) return null
    // A canceled item's lock is ended (a lapse ends the lock); only a live item holds its founding rate.
    if (data.status === 'canceled') return null
    return typeof data.locked_price_id === 'string' ? data.locked_price_id : null
  } catch {
    return null
  }
}
