// PRICING STRIPE PRICE MAP — the IO layer over `pricing_stripe_prices` (Pricing P2, ADR-363).
// Reads the resolved Stripe Product/Price ids by key (written by syncPricingProductsToStripe) and
// upserts them. Server-only (service-role). FAIL-SAFE: a missing row / DB error reads as "not synced"
// (null) so a checkout cleanly no-ops rather than charging at the wrong price. The table is not in
// lib/database.types.ts yet (ADR-246) — reached with untyped casts, like lib/pricing/settings.ts.

import { createAdminClient } from '@/lib/supabase/admin'

export interface StripePriceRow {
  key: string
  stripe_product_id: string | null
  stripe_price_id: string | null
  archived: boolean
}

/** Read the whole price map as key -> row. REQUEST-uncached (admin surface reads it fresh after a
 *  sync). FAIL-SAFE: returns `{}` on any error (missing table pre-migration, transient DB), so callers
 *  treat every key as "not synced". */
export async function loadStripePriceMap(): Promise<Record<string, StripePriceRow>> {
  try {
    const db = createAdminClient()
    const { data, error } = await (db as unknown as {
      from: (t: string) => {
        select: (c: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
      }
    })
      .from('pricing_stripe_prices')
      .select('key, stripe_product_id, stripe_price_id, archived')
    if (error || !data) return {}
    const out: Record<string, StripePriceRow> = {}
    for (const r of data) {
      const key = typeof r.key === 'string' ? r.key : null
      if (!key) continue
      out[key] = {
        key,
        stripe_product_id: typeof r.stripe_product_id === 'string' ? r.stripe_product_id : null,
        stripe_price_id: typeof r.stripe_price_id === 'string' ? r.stripe_price_id : null,
        archived: r.archived === true,
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Resolve a single Stripe Price id by key (or null when not synced). FAIL-SAFE. */
export async function resolveStripePriceId(key: string): Promise<string | null> {
  const map = await loadStripePriceMap()
  return map[key]?.stripe_price_id ?? null
}

// authz-delegated: platform-wide pricing-catalog config write (ADR-274), no per-caller scope by
// design; the only writer is the janitor-gated /admin/pricing "Sync products to Stripe" action via
// syncPricingProductsToStripe (which also requires billingEnabled()).
/** Upsert a resolved Stripe Product/Price for a key. Service-role; the caller (the env-gated admin
 *  sync action / syncPricingProductsToStripe) authorizes. Throws on a DB error so the sync surfaces it. */
export async function upsertStripePrice(row: {
  key: string
  stripe_product_id: string | null
  stripe_price_id: string | null
  archived?: boolean
  changedBy?: string | null
}): Promise<void> {
  const db = createAdminClient()
  const { error } = await (db as unknown as {
    from: (t: string) => {
      upsert: (v: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>
    }
  })
    .from('pricing_stripe_prices')
    .upsert({
      key: row.key,
      stripe_product_id: row.stripe_product_id,
      stripe_price_id: row.stripe_price_id,
      archived: row.archived ?? false,
      updated_at: new Date().toISOString(),
      updated_by: row.changedBy ?? null,
    })
  if (error) throw new Error(error.message ?? 'Could not save the Stripe price mapping.')
}
