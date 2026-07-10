// Seller verification signal for Market listings / storefronts (ADR-598, Phase 8). READ-ONLY:
// no new identity flow — this reads the verification state that already exists and derives a
// single "is this seller verified" boolean the VerifiedBadge renders from.
//
// A seller is verified when:
//   • Space seller (owner_kind='space')   — the Space is a Business/nonprofit page
//     (isConsoleSpaceType), i.e. holds the full Shop tier. That IS the Business Space designator.
//   • Member seller (owner_kind='profile') — the member holds a LIVE partner persona
//     (verified/active), i.e. a passed persona verification (profile_personas, ADR-163 P2.7).
// Platform (first-party Frequency Store) is inherently trusted and always reads verified.
//
// Server-only (admin client behind app-code authz).

import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_PERSONA_STATES } from '@/lib/personas'
import { normalizeSpaceType, isConsoleSpaceType } from '@/lib/spaces/types'
import type { CommerceProduct } from './types'

type SellerRef = Pick<CommerceProduct, 'id' | 'ownerKind' | 'ownerProfileId' | 'ownerSpaceId'>

/** Batch: which products are sold by a verified seller. One query per owner class (spaces,
 *  profiles), grouped in-process. Returns a Map keyed by product id (absent = not verified).
 *  Fail-safe to an empty Map. */
export async function sellerVerifiedFor(products: SellerRef[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  if (products.length === 0) return out
  const db = createAdminClient()

  const spaceIds = Array.from(
    new Set(products.filter((p) => p.ownerKind === 'space' && p.ownerSpaceId).map((p) => p.ownerSpaceId as string)),
  )
  const profileIds = Array.from(
    new Set(products.filter((p) => p.ownerKind === 'profile' && p.ownerProfileId).map((p) => p.ownerProfileId as string)),
  )

  const verifiedSpaces = new Set<string>()
  const verifiedProfiles = new Set<string>()

  try {
    if (spaceIds.length > 0) {
      const { data } = await db.from('spaces').select('id, type').in('id', spaceIds)
      for (const s of (data ?? []) as { id: string; type: string | null }[]) {
        if (isConsoleSpaceType(normalizeSpaceType(s.type))) verifiedSpaces.add(s.id)
      }
    }
    if (profileIds.length > 0) {
      const { data } = await db
        .from('profile_personas')
        .select('profile_id, state')
        .in('profile_id', profileIds)
        .in('state', LIVE_PERSONA_STATES as unknown as string[])
      for (const r of (data ?? []) as { profile_id: string }[]) verifiedProfiles.add(r.profile_id)
    }
  } catch {
    return out
  }

  for (const p of products) {
    let verified = false
    if (p.ownerKind === 'platform') verified = true
    else if (p.ownerKind === 'space') verified = !!p.ownerSpaceId && verifiedSpaces.has(p.ownerSpaceId)
    else if (p.ownerKind === 'profile') verified = !!p.ownerProfileId && verifiedProfiles.has(p.ownerProfileId)
    if (verified) out.set(p.id, true)
  }
  return out
}

/** Single-product convenience wrapper (product detail page / storefront header). */
export async function sellerVerifiedForProduct(product: SellerRef): Promise<boolean> {
  const map = await sellerVerifiedFor([product])
  return map.get(product.id) ?? false
}
