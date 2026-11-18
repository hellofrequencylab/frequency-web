// Seller shipping profiles, the store (DEF-ETSY P3, migration 20270346150000). Service role, like the other
// commerce modules: the CALLER has already passed the Space manage gate (the Shop console action) or
// established the buyer from the session (the cart), and the COMMERCE_CART_ENABLED switch. Every rate list
// read or written goes through parseShippingRates (./shipping-profiles), so a malformed row yields no rate,
// never a bad one. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseShippingRates, type ShippingProfile, type ShippingRate } from './shipping-profiles'

// eslint-disable-next-line no-restricted-syntax -- commerce_shipping_profiles is not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

const PROFILE_COLS = 'id, name, currency, processing_days_min, processing_days_max, rates'

function rowToProfile(r: Record<string, unknown>): ShippingProfile {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    currency: String(r.currency ?? 'usd'),
    processingDaysMin: Number(r.processing_days_min ?? 0),
    processingDaysMax: Number(r.processing_days_max ?? 0),
    rates: parseShippingRates(r.rates),
  }
}

/** A Space's shipping profiles and which of its listings use each one. Throws on a failed read so the
 *  console shows an error instead of an empty list a seller might "fill in" twice. */
export async function listSpaceShippingProfiles(
  spaceId: string,
): Promise<{ profiles: ShippingProfile[]; attached: Map<string, string> }> {
  const [profiles, products] = await Promise.all([
    db().from('commerce_shipping_profiles').select(PROFILE_COLS).eq('owner_space_id', spaceId).order('created_at'),
    db().from('commerce_products').select('id, shipping_profile_id').eq('owner_space_id', spaceId).not('shipping_profile_id', 'is', null),
  ])
  if (profiles.error) throw new Error(`[shipping] list failed: ${profiles.error.message}`)
  if (products.error) throw new Error(`[shipping] list failed: ${products.error.message}`)
  const attached = new Map<string, string>()
  for (const r of (products.data ?? []) as { id: string; shipping_profile_id: string | null }[]) {
    if (r.shipping_profile_id) attached.set(r.id, r.shipping_profile_id)
  }
  return { profiles: ((profiles.data ?? []) as Record<string, unknown>[]).map(rowToProfile), attached }
}

interface ShippingProfileInput {
  name: string
  processingDaysMin: number
  processingDaysMax: number
  rates: ShippingRate[]
}

/**
 * Create (id null) or edit one of a Space's shipping profiles, then point exactly `productIds` at it: the
 * Space's own physical listings among them are attached, and any of its listings that pointed here and are
 * not in the list are let go. A profile id that is not this Space's writes nothing. Returns the profile id,
 * or null when nothing was written.
 */
export async function saveSpaceShippingProfile(
  spaceId: string,
  id: string | null,
  input: ShippingProfileInput,
  productIds: readonly string[],
): Promise<string | null> {
  const row = {
    name: input.name,
    processing_days_min: input.processingDaysMin,
    processing_days_max: input.processingDaysMax,
    rates: parseShippingRates(input.rates),
  }
  let profileId: string
  if (id) {
    const { data, error } = await db()
      .from('commerce_shipping_profiles')
      .update(row)
      .eq('id', id)
      .eq('owner_space_id', spaceId)
      .select('id')
      .maybeSingle()
    if (error) throw new Error(`[shipping] save failed: ${error.message}`)
    if (!data) return null
    profileId = id
  } else {
    const { data, error } = await db()
      .from('commerce_shipping_profiles')
      .insert({ ...row, owner_kind: 'space', owner_space_id: spaceId })
      .select('id')
      .single()
    if (error || !data) throw new Error(`[shipping] create failed: ${error?.message ?? 'no row'}`)
    profileId = String((data as { id: string }).id)
  }

  const keep = [...new Set(productIds)]
  const release = db()
    .from('commerce_products')
    .update({ shipping_profile_id: null })
    .eq('owner_space_id', spaceId)
    .eq('shipping_profile_id', profileId)
  const { error: releaseError } = keep.length
    ? await release.not('id', 'in', `(${keep.join(',')})`)
    : await release
  if (releaseError) throw new Error(`[shipping] detach failed: ${releaseError.message}`)
  if (keep.length) {
    const { error: attachError } = await db()
      .from('commerce_products')
      .update({ shipping_profile_id: profileId })
      .eq('owner_space_id', spaceId)
      .eq('product_kind', 'physical')
      .in('id', keep)
    if (attachError) throw new Error(`[shipping] attach failed: ${attachError.message}`)
  }
  return profileId
}

/**
 * The profile each listing ships with, by product id; a listing with none is absent. FAIL-SOFT and loud:
 * a failed read answers an empty map (the cart quotes no shipping, which is what it did before profiles
 * existed) and logs, so a cart page never breaks on it and a read that keeps failing shows in the logs.
 */
export async function shippingProfilesForProducts(productIds: readonly string[]): Promise<Map<string, ShippingProfile>> {
  const out = new Map<string, ShippingProfile>()
  const ids = [...new Set(productIds)]
  if (ids.length === 0) return out
  try {
    const { data: links, error } = await db().from('commerce_products').select('id, shipping_profile_id').in('id', ids)
    if (error) throw new Error(error.message)
    const byProduct = new Map<string, string>()
    for (const r of (links ?? []) as { id: string; shipping_profile_id: string | null }[]) {
      if (r.shipping_profile_id) byProduct.set(r.id, r.shipping_profile_id)
    }
    if (byProduct.size === 0) return out
    const { data: rows, error: profileError } = await db()
      .from('commerce_shipping_profiles')
      .select(PROFILE_COLS)
      .in('id', [...new Set(byProduct.values())])
    if (profileError) throw new Error(profileError.message)
    const profiles = new Map(((rows ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), rowToProfile(r)]))
    for (const [productId, profileId] of byProduct) {
      const p = profiles.get(profileId)
      if (p) out.set(productId, p)
    }
  } catch (err) {
    console.error('[shipping] could not read shipping profiles; quoting none', { err })
    out.clear()
  }
  return out
}
