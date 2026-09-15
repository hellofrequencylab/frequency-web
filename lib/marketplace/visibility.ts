import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'

// Operator-controlled, per-area visibility for the marketplace. An area can be switched
// OFF so an operator can build/stock it while it stays invisible to members (hidden from
// nav, footer, menus, and the pages themselves). Backed by platform_flags
// (`marketplace_<area>_published`), toggled at /admin/marketplace.
//
// FAIL-OPEN: a missing flag row or a read error reads as PUBLISHED. The marketplace went
// live in #1052, so absence = visible; a transient DB hiccup must never blank a live area.
// 2026-09-05 (scan2 L3-07): half of that is corrected. A MISSING ROW still reads as published
// (absence = visible, as above). A READ ERROR now reads as HIDDEN for every area: an outage must
// not publish an area an operator un-published, which is the direction every other operator
// switch in lib/platform-flags.ts already fails. Note also that supabase-js resolves `{ error }`
// and never throws, so the try/catch below was decorative; the error is now read.

export type MarketArea = 'market' | 'housing' | 'makers' | 'shop'

export const MARKET_AREAS: readonly MarketArea[] = ['market', 'housing', 'makers', 'shop']

export const AREA_LABEL: Record<MarketArea, string> = {
  market: 'Classifieds',
  housing: 'Housing',
  makers: 'Market',
  shop: 'Frequency Store',
}

// The route prefix each area owns. The shell gates a member out of any path under a hidden
// area's prefix (exact, or prefix + '/', so '/classifieds' never swallows '/marketplace/...').
export const AREA_PREFIX: Record<MarketArea, string> = {
  market: '/classifieds',
  housing: '/housing',
  makers: '/market',
  shop: '/store',
}

// The NAV_AREAS key each area maps to (the maker vertical's nav key is the singular 'maker').
export const AREA_NAV_KEY: Record<MarketArea, string> = {
  market: 'market',
  housing: 'housing',
  makers: 'maker',
  shop: 'shop',
}

export function areaFlagKey(area: MarketArea): string {
  return `marketplace_${area}_published`
}

/** Every area hidden: the answer on a read error, so an outage cannot publish anything. */
const ALL_HIDDEN: Readonly<Record<MarketArea, boolean>> = { market: false, housing: false, makers: false, shop: false }

/** Published state per area. Defaults TRUE on a missing row (fail-open) and FALSE on a read
 *  error (fail-closed, scan2 L3-07). Operators still see hidden areas via isMarketplaceOperator. */
export const marketplaceVisibility = cache(async (): Promise<Record<MarketArea, boolean>> => {
  const out: Record<MarketArea, boolean> = { market: true, housing: true, makers: true, shop: true }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('platform_flags')
      .select('key, value')
      .in('key', MARKET_AREAS.map(areaFlagKey))
    if (error) return { ...ALL_HIDDEN }
    const byKey = new Map(((data ?? []) as { key: string; value: boolean }[]).map((r) => [r.key, r.value]))
    for (const area of MARKET_AREAS) {
      const v = byKey.get(areaFlagKey(area))
      if (typeof v === 'boolean') out[area] = v
    }
  } catch {
    // 2026-09-05 (scan2 L3-07): fail-closed. This used to leave everything visible.
    return { ...ALL_HIDDEN }
  }
  return out
})

/** Is the caller a marketplace operator (sees hidden areas + can edit)? Platform staff
 *  (web_role admin/janitor) or a staff role holding the 'platform' domain. */
export const isMarketplaceOperator = cache(async (): Promise<boolean> => {
  try {
    const profile = await getCallerProfile()
    if (!profile) return false
    if (isStaff(profile.webRole)) return true
    const staff = await getStaffMember().catch(() => null)
    return staffCan(staff?.role ?? null, 'platform', 'read')
  } catch {
    return false
  }
})

// ── What a commerce NAV may show (LIVE-245) ──────────────────────────────────────────────
// The block above is the operator switch; these two are the half that was missing. The switch
// reached app/(main)/layout.tsx, which drops a hidden area from the member nav (navAccess ->
// 'none') and redirects a member off its route, and components/marketplace/hidden-banner.tsx.
// It never reached the MARKETPLACE AREA NAV, because MarketplaceFacets and MarketplaceGuide
// typed all five areas with no visibility input at all. So with marketplace_shop_published
// false in production since 2026-07-11, both still rendered a Frequency Store entry on every
// commerce surface, and a member who clicked it was bounced to /feed.

/** The market areas a viewer may browse. An operator sees every area, so a hidden one stays
 *  reachable while it is being stocked; everyone else sees only the published ones. PURE, so a
 *  nav's own test can drive every case without a database. */
export function visibleAreas(
  vis: Record<MarketArea, boolean>,
  operator: boolean,
): readonly MarketArea[] {
  return operator ? MARKET_AREAS : MARKET_AREAS.filter((a) => vis[a])
}

/** The one read both commerce navs share: which areas to render for THIS viewer. Both halves are
 *  React-cached and app/(main)/layout.tsx already takes them on every request in this segment, so
 *  a commerce surface pays nothing extra for asking. */
export const browsableAreas = cache(async (): Promise<readonly MarketArea[]> => {
  const [vis, operator] = await Promise.all([marketplaceVisibility(), isMarketplaceOperator()])
  return visibleAreas(vis, operator)
})
