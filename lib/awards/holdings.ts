// What a member HOLDS — the one read the earned-cosmetics lane gates on (PROG-SPOT increment 4,
// ADR-1279).
//
// Ownership of an item is a `store_redemptions` row for that member and that `store_items` row
// (lib/awards/cosmetics.ts states the same rule from the granting side: a grant IS a redemption
// with gems_spent 0). This module only READS that fact, keyed by the item's stable `slug`, which is
// what `ProfileSkin.requiredItem` and `SpotlightStickerDef.requiredItem` name.
//
// PURE over a supplied client on purpose: no Supabase import of its own, so it is not one more
// admin-client site (scripts/check-admin-client.mjs) and a session client works just as well —
// `store_redemptions` lets a member read their own rows, which is exactly the question asked
// here. The caller decides whose client asks.

import type { SupabaseClient } from '@supabase/supabase-js'

/** The client the read runs over: anything with Supabase's `.from`. Both the session client and the
 *  admin client satisfy it (the same untyped-`Database` shape lib/awards/cosmetics.ts uses, which
 *  keeps the typed client's query-builder generics from being instantiated at the call site); a
 *  test hands in a stub. The read only ever asks `.from('store_redemptions').select(...).eq(...)`. */
export type HoldingsClient = Pick<SupabaseClient, 'from'>

/** Every item slug the member holds, as a set. Empty on any error (fail-closed: a broken read
 *  means "not held", so a gate never unlocks on a failure). */
export async function memberHeldItems(client: HoldingsClient, profileId: string): Promise<Set<string>> {
  if (!profileId) return new Set()
  try {
    const { data } = await client
      .from('store_redemptions')
      .select('item:store_items(slug)')
      .eq('profile_id', profileId)
    const held = new Set<string>()
    for (const row of Array.isArray(data) ? data : []) {
      if (!row || typeof row !== 'object') continue
      const item = (row as { item?: { slug?: unknown } | { slug?: unknown }[] | null }).item
      const slug = Array.isArray(item) ? item[0]?.slug : item?.slug
      if (typeof slug === 'string' && slug) held.add(slug)
    }
    return held
  } catch {
    return new Set()
  }
}

/** Does the member hold ONE item? A convenience over `memberHeldItems` for a single check. */
export async function memberHoldsItem(client: HoldingsClient, profileId: string, itemKey: string): Promise<boolean> {
  if (!itemKey) return false
  return (await memberHeldItems(client, profileId)).has(itemKey)
}
