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
// (ADR-460; re-tiered ADR-472.) The base TIER item is 'base' (Pro core) or 'business' (Business full
// depth); the sole metered add-on item is 'ai'; the seat + org items carry their own keys. This is the
// DB-level key, distinct from the catalog item key (pro_base -> 'base'; business_base -> 'business';
// addon_ai -> 'ai'). The legacy marketing/team/branding short keys are KEPT in the set so a legacy
// space_subscription_items row still narrows (asItemKey), but they no longer map to an AddonKey (their
// depth folded into the Business tier) and the catalog no longer produces them.
export const ITEM_KEYS = [
  'base',
  'business',
  'collective', // COLLECTIVE base (ADR-811): the network-depth tier (collective_base -> 'collective')
  'independent', // INDEPENDENT base (ADR-811): the standalone white-label tier (independent_base -> 'independent')
  'ai',
  'nonprofit_seat',
  'operator_seat', // OPERATOR SEATS (ADR-799): a real per-seat add-on, quantity = extra operators
  'organization',
  // RETIRED (ADR-472), kept resolvable for legacy rows only:
  'marketing',
  'team',
  'branding',
] as const

export type ItemKey = (typeof ITEM_KEYS)[number]

/** Narrow an arbitrary value to a known DB item_key, or null (default-deny). PURE. */
export function asItemKey(raw: string | null | undefined): ItemKey | null {
  return (ITEM_KEYS as readonly string[]).includes(raw ?? '') ? (raw as ItemKey) : null
}

/** The DB item_key for a catalog item key (business_base -> business; addon_ai -> ai; nonprofit_seat
 *  maps 1:1). PURE (ADR-552). The RETIRED catalog keys pro_base / organization are kept RESOLVABLE for a
 *  grandfathered legacy subscription row (pro_base -> the legacy 'base' item; organization -> its own
 *  legacy item), so an old multi-item sub still narrows to a plan. Returns null for an unknown key. */
export function itemKeyForCatalogKey(catalogKey: string | null | undefined): ItemKey | null {
  const key = asCatalogItemKey(catalogKey)
  if (key === 'business_base') return 'business'
  if (key === 'collective_base') return 'collective' // the network-depth base (ADR-811)
  if (key === 'independent_base') return 'independent' // the standalone white-label base (ADR-811)
  if (key) {
    const addon = addonKeyForCatalogItem(key)
    if (addon) return addon
    if (key === 'nonprofit_seat') return 'nonprofit_seat'
    if (key === 'operator_seat') return 'operator_seat' // the per-seat operator add-on (ADR-799)
  }
  // RETIRED (ADR-552), kept resolvable for legacy rows: the former Pro base + Organization catalog keys.
  if (catalogKey === 'pro_base') return 'base'
  if (catalogKey === 'organization') return 'organization'
  return null
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

/** The licensed OPERATOR-SEAT quantity a set of reconciled items buys, to persist onto
 *  spaces.seat_quantity (ADR-799). PURE. Sums the quantity of the `operator_seat` item(s) ONLY — the one
 *  genuinely per-seat item. NOTHING else counts: the flat plan items (business/nonprofit_seat) are
 *  perSeat:false and bill quantity 1, so they must NOT be read as seats (that was the reverted ADR-465
 *  bug). An empty / seat-less set buys 0, leaving the Space with only its base owner seat. Floors each
 *  quantity at 0. */
export function seatQuantityFromItems(items: readonly ReconciledItem[]): number {
  let total = 0
  for (const it of items) {
    if (it.itemKey === 'operator_seat') {
      const q = Math.floor(it.quantity)
      total += Number.isFinite(q) && q > 0 ? q : 0
    }
  }
  return total
}

/** The base TIER a set of item keys implies. PURE (ADR-552). Highest-ranked wins: nonprofit > business >
 *  free. The legacy 'organization' item folds to nonprofit; a 'nonprofit_seat' item -> nonprofit; a
 *  'business' item OR the legacy 'base' (former Pro) item -> business; an empty set -> free. */
export function planForItemKeys(itemKeys: readonly ItemKey[]): SpacePlan {
  if (itemKeys.includes('organization')) return 'nonprofit' // legacy org folds to nonprofit
  if (itemKeys.includes('nonprofit_seat')) return 'nonprofit'
  if (itemKeys.includes('business')) return 'business'
  if (itemKeys.includes('base')) return 'business' // legacy Pro base folds to business
  return 'free'
}

/** The active AddonKey set a set of item keys implies (the metered add-on items only). PURE. Deduped.
 *  The resolver (setSpaceAddons) unions these onto the base tier's depth to set-to-target the billing
 *  namespace. Only 'ai' is an add-on now (ADR-472); the legacy marketing/team/branding item keys narrow
 *  to null and are ignored (their depth is implied by the Business tier, not an add-on). */
export function addonsForItemKeys(itemKeys: readonly ItemKey[]): AddonKey[] {
  const out = new Set<AddonKey>()
  for (const key of itemKeys) {
    const addon = asAddonKey(key) // only 'ai' narrows to AddonKey; everything else -> null
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

/** Does a Space have a LIVE paid subscription right now? The paying-state signal the take-rate keys on
 *  (ADR-552): a free Business and a paying Business can share spaces.plan = 'business' (free-vs-paid is a
 *  usage state within Business), so the take-rate cannot key on the plan label alone. TRUE when any
 *  space_subscription_items row for the Space is in a live status (active / trialing / past_due); a
 *  canceled / pending / absent row reads NOT paying. Service-role; FAIL-SAFE to FALSE — an error reads
 *  NOT paying, so the space pays the higher free rate (over-collect, never under-collect). */
export async function spaceIsPaying(spaceId: string | null | undefined): Promise<boolean> {
  if (!spaceId) return false
  try {
    const db = createAdminClient()
    const { data } = (await (db as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c1: string, v1: string) => {
            in: (c2: string, vals: string[]) => { limit: (n: number) => Promise<{ data: unknown[] | null }> }
          }
        }
      }
    })
      .from('space_subscription_items')
      .select('id')
      .eq('space_id', spaceId)
      .in('status', ['active', 'trialing', 'past_due'])
      .limit(1)) as { data: unknown[] | null }
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
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
