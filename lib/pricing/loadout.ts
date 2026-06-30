// LOADOUT MATH — the PURE Pro loadout total (ADR-463; re-tiered ADR-472, docs/PRICING-LADDER-PLAN.md
// §1b/§4). A Space buys a BASE tier plus the sole metered ADD-ON (AI Engine); the picker shows a LIVE
// total as the operator flips the AI toggle + the monthly/yearly switch. This module is the single
// source of that arithmetic, framework-independent (no Stripe/Supabase/Next), so it runs identically on
// the client (the live picker) and the server (a sanity check / a future quote), and is trivially
// unit-testable.
//
// TODO(ADR-472 surfaces): the Marketing / Team / Branding add-ons folded into tier depth (Pro vs
// Business), so they are no longer loadout lines. The Tier x Mode picker rebuild (separate PR) makes
// this tier-aware; today it still composes a single Pro base + the AI add-on.
//
// THE SHAPE. Each catalog item carries a LIST anchor and a lower FOUNDING (charged) amount, per
// interval (lib/pricing/catalog-config.ts resolves the operator-edited amounts). A loadout total sums
// the base + each active add-on at the chosen interval, multiplying the per-seat add-on (Team) by its
// seat count. We return BOTH the list total (the crossed-out anchor) and the founding total (what is
// charged), so the surface shows "~~$X~~ $Y, founding price" for the whole loadout.

import type { ResolvedCatalogItem } from './catalog-config'
import { ADDON_KEYS, type AddonKey } from './plans'
import { asCatalogItemKey, type BillingInterval, type CatalogItemKey } from '@/lib/billing/pricing-keys'

/** A line in the loadout breakdown: one catalog item at the chosen interval + quantity. */
export interface LoadoutLine {
  key: CatalogItemKey
  label: string
  /** True for the Pro base line (always present), false for an add-on line. */
  isBase: boolean
  perSeat: boolean
  quantity: number
  /** The list anchor amount for this line (per unit x quantity), in cents. */
  listCents: number
  /** The founding (charged) amount for this line (per unit x quantity), in cents. */
  foundingCents: number
}

/** The computed loadout total: the per-line breakdown plus the summed list + founding totals. */
export interface LoadoutTotal {
  interval: BillingInterval
  lines: LoadoutLine[]
  /** The list anchor total (the crossed-out price), in cents. */
  listCents: number
  /** The founding (charged) total, in cents. The headline number. */
  foundingCents: number
  /** The amount the founding price saves under the list anchor, in cents (>= 0). */
  savingsCents: number
}

/** The catalog item key for an add-on (ai -> addon_ai). PURE. (Only AI is an add-on now, ADR-472.) */
export function addonCatalogKey(addon: AddonKey): CatalogItemKey {
  // The catalog item keys are exactly `addon_<key>`; asCatalogItemKey narrows (default-deny).
  return asCatalogItemKey(`addon_${addon}`) ?? 'addon_ai'
}

/** Normalize a selected-add-on list to the deduped, valid AddonKey set, honoring an optional enabled
 *  map (a disabled add-on is dropped). PURE. */
export function normalizeAddons(
  addons: readonly (AddonKey | string)[],
  enabled?: Record<AddonKey, boolean>,
): AddonKey[] {
  const set = new Set<AddonKey>()
  for (const a of addons) {
    if ((ADDON_KEYS as readonly string[]).includes(a)) {
      const key = a as AddonKey
      if (!enabled || enabled[key]) set.add(key)
    }
  }
  return [...set]
}

/** Compute the live Pro loadout total from the resolved catalog items. PURE.
 *
 *  @param itemsByKey  the resolved catalog items keyed by item key (from catalogConfigByKey)
 *  @param addons      the active add-on keys (deduped/validated internally)
 *  @param interval    'month' or 'year' (the amounts already encode two-months-free for year)
 *  @param seatQuantity reserved for the tier-level licensed seat count (Phase D); the AI add-on is not
 *                      per-seat, so it does not multiply. Kept in the signature for caller compatibility.
 *
 *  The base tier is always included. Each active add-on (only AI now, ADR-472) adds its line. List +
 *  founding totals are summed independently so the surface can show the anchor beneath the charged total.
 *
 *  TODO(ADR-472 surfaces): this still hard-codes the `pro_base` line + a flat per-add-on quantity. The
 *  Tier x Mode picker rebuild (separate PR) replaces this with a tier-aware base + per-seat tier billing. */
export function computeLoadoutTotal(
  itemsByKey: Record<CatalogItemKey, ResolvedCatalogItem>,
  addons: readonly (AddonKey | string)[],
  interval: BillingInterval,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  seatQuantity = 1,
): LoadoutTotal {
  const lines: LoadoutLine[] = []

  const pushLine = (key: CatalogItemKey, isBase: boolean, qty: number) => {
    const item = itemsByKey[key]
    if (!item) return
    const amounts = interval === 'month' ? item.month : item.year
    lines.push({
      key,
      label: item.label,
      isBase,
      perSeat: item.perSeat,
      quantity: qty,
      listCents: amounts.listCents * qty,
      foundingCents: amounts.foundingCents * qty,
    })
  }

  // The Pro base is always the first line.
  pushLine('pro_base', true, 1)

  // One line per active add-on. Only AI is a metered add-on now (not per-seat), so qty is always 1.
  for (const addon of normalizeAddons(addons)) {
    pushLine(addonCatalogKey(addon), false, 1)
  }

  const listCents = lines.reduce((s, l) => s + l.listCents, 0)
  const foundingCents = lines.reduce((s, l) => s + l.foundingCents, 0)
  return {
    interval,
    lines,
    listCents,
    foundingCents,
    savingsCents: Math.max(0, listCents - foundingCents),
  }
}

/** Cents -> a plain price label, e.g. 1900 -> "$19", 1950 -> "$19.50". Whole dollars drop the cents.
 *  USD only. PURE (mirrors lib/pricing/display.ts formatCents, duplicated here to keep this module
 *  framework + dependency free for the client picker). */
export function formatLoadoutCents(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** The per-interval suffix for a price label ("/mo" or "/yr"). PURE. */
export function intervalSuffix(interval: BillingInterval): string {
  return interval === 'month' ? '/mo' : '/yr'
}
