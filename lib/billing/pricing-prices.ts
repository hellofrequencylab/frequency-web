// PRICING STRIPE PRICE MAP — the IO layer over `pricing_stripe_prices` (Pricing P2, ADR-363).
// Reads the resolved Stripe Product/Price ids by key (written by syncPricingProductsToStripe) and
// upserts them. Server-only (service-role). FAIL-SAFE: a missing row / DB error reads as "not synced"
// (null) so a checkout cleanly no-ops rather than charging at the wrong price. The table is in
// lib/database.types.ts, so access goes through the typed client.
//
// PROVENANCE (HYG-049, ADR-1227). A price id is only meaningful to the account and mode that minted
// it. Every row now carries `stripe_account_id` + `livemode` from the sync that wrote it, and
// `resolveStripePriceId` refuses a row whose provenance differs from the key in force — so a rotated
// key answers "not synced" (no charge, a named log line) instead of a "No such price" the member
// reads as an outage. A row synced before the columns existed is NULL on both and resolves as it
// always did; the next sync stamps it. The columns are read through `select('*')` and written
// through a cast, so the code runs before AND after migration 20270345002000 is applied: before it,
// a sync surfaces the missing column as its error, which is the operator's cue to apply it.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { log } from '@/lib/log'
import { keyLivemode, stripeAccountId } from './stripe'

export interface StripePriceRow {
  key: string
  stripe_product_id: string | null
  stripe_price_id: string | null
  archived: boolean
  /** The Stripe account whose key minted the price, or null for a row synced before HYG-049. */
  stripe_account_id: string | null
  /** true = minted by a live-mode key, false = test-mode, null = synced before HYG-049. */
  livemode: boolean | null
}

/** What the key in force looks like, for the provenance comparison. Either half may be null: the
 *  account when the lookup failed (compare livemode alone), livemode when billing is off. */
export interface KeyIdentity {
  accountId: string | null
  livemode: boolean | null
}

export type PriceProvenance = 'ok' | 'unstamped' | 'foreign'

/** PURE: does this row belong to the key in force? `unstamped` is a row with no provenance at all
 *  (pre-HYG-049), allowed as before. `foreign` is a row whose RECORDED account or mode contradicts a
 *  KNOWN half of the live key — an unknown live half never convicts, so a transient account lookup
 *  failure cannot turn every checkout off. */
export function priceProvenance(row: Pick<StripePriceRow, 'stripe_account_id' | 'livemode'>, live: KeyIdentity): PriceProvenance {
  if (row.stripe_account_id === null && row.livemode === null) return 'unstamped'
  if (row.stripe_account_id !== null && live.accountId !== null && row.stripe_account_id !== live.accountId) return 'foreign'
  if (row.livemode !== null && live.livemode !== null && row.livemode !== live.livemode) return 'foreign'
  return 'ok'
}

/** The generated Row carries both provenance columns (migration 20270345002000 is in the tree);
 *  they are read as OPTIONAL here because a database ahead of the apply returns no such keys. */
type PriceRowRead = Omit<Database['public']['Tables']['pricing_stripe_prices']['Row'], 'stripe_account_id' | 'livemode'> & {
  stripe_account_id?: string | null
  livemode?: boolean | null
}

/** Read the whole price map as key -> row. REQUEST-uncached (admin surface reads it fresh after a
 *  sync). FAIL-SAFE: returns `{}` on any error (missing table pre-migration, transient DB), so callers
 *  treat every key as "not synced". */
export async function loadStripePriceMap(): Promise<Record<string, StripePriceRow>> {
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('pricing_stripe_prices').select('*')
    if (error || !data) return {}
    const out: Record<string, StripePriceRow> = {}
    for (const r of data as PriceRowRead[]) {
      out[r.key] = {
        key: r.key,
        stripe_product_id: r.stripe_product_id,
        stripe_price_id: r.stripe_price_id,
        archived: r.archived === true,
        stripe_account_id: r.stripe_account_id ?? null,
        livemode: typeof r.livemode === 'boolean' ? r.livemode : null,
      }
    }
    return out
  } catch {
    return {}
  }
}

/** The identity of the key in force, for the provenance check. */
async function liveKeyIdentity(): Promise<KeyIdentity> {
  return { accountId: await stripeAccountId(), livemode: keyLivemode() }
}

/** Resolve a single Stripe Price id by key (or null when not synced). FAIL-SAFE. A row minted by a
 *  different account or mode than the key in force is REFUSED (null) and named in the log, so a
 *  rotated key reads as "not synced" rather than as Stripe being down (HYG-049). */
export async function resolveStripePriceId(key: string): Promise<string | null> {
  const row = (await loadStripePriceMap())[key]
  if (!row?.stripe_price_id) return null
  const live = await liveKeyIdentity()
  if (priceProvenance(row, live) === 'foreign') {
    log.error('billing.price.foreign', {
      key,
      stripe_price_id: row.stripe_price_id,
      row_account: row.stripe_account_id,
      row_livemode: row.livemode,
      key_account: live.accountId,
      key_livemode: live.livemode,
    })
    return null
  }
  return row.stripe_price_id
}

// authz-delegated: platform-wide pricing-catalog config write (ADR-274), no per-caller scope by
// design; the only writer is the janitor-gated /admin/pricing "Sync products to Stripe" action via
// syncPricingProductsToStripe (which also requires billingEnabled()).
/** Upsert a resolved Stripe Product/Price for a key, stamped with the account + mode that minted it.
 *  Service-role; the caller (the env-gated admin sync action / syncPricingProductsToStripe)
 *  authorizes. Throws on a DB error so the sync surfaces it — including the missing-column error a
 *  tree ahead of migration 20270345002000 produces, which is the cue to apply it. */
export async function upsertStripePrice(row: {
  key: string
  stripe_product_id: string | null
  stripe_price_id: string | null
  archived?: boolean
  changedBy?: string | null
  /** Who minted the ids. Omit to stamp with the key in force; pass a row's own values to re-save a
   *  row without claiming it for the current key (the retired-key archive pass). */
  provenance?: { stripe_account_id: string | null; livemode: boolean | null }
}): Promise<void> {
  const db = createAdminClient()
  const provenance = row.provenance ?? { stripe_account_id: await stripeAccountId(), livemode: keyLivemode() }
  const insert: Database['public']['Tables']['pricing_stripe_prices']['Insert'] = {
    key: row.key,
    stripe_product_id: row.stripe_product_id,
    stripe_price_id: row.stripe_price_id,
    archived: row.archived ?? false,
    updated_at: new Date().toISOString(),
    updated_by: row.changedBy ?? null,
    stripe_account_id: provenance.stripe_account_id,
    livemode: provenance.livemode,
  }
  const { error } = await db.from('pricing_stripe_prices').upsert(insert)
  if (error) throw new Error(error.message ?? 'Could not save the Stripe price mapping.')
}
