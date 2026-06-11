'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { canCashIn } from '@/lib/core/entitlement'
import type { EntitlementTier } from '@/lib/core/entitlement'

export async function redeemItem(itemId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not authenticated')

  const admin = createAdminClient()
  // season_id / expires_at lag the generated Database types (repo pattern: untyped
  // handle until `supabase gen types` is re-run).
  const db = admin as unknown as SupabaseClient

  const [{ data: itemRow }, { data: profile }, { data: spends }] = await Promise.all([
    db.from('store_items')
      .select('id, slug, gem_cost, stock, is_active, metadata, category, season_id, expires_at')
      .eq('id', itemId)
      .maybeSingle(),
    admin.from('profiles')
      .select('id, lifetime_gems, current_season_rank, membership_tier')
      .eq('id', profileId)
      .maybeSingle(),
    admin.from('store_redemptions')
      .select('gems_spent')
      .eq('profile_id', profileId),
  ])
  const item = itemRow as {
    id: string
    slug: string
    gem_cost: number
    stock: number | null
    is_active: boolean
    metadata: Record<string, unknown> | null
    category: string
    season_id: number | null
    expires_at: string | null
  } | null

  if (!item) return fail('Item not found')
  if (!item.is_active) return fail('Item is no longer available')

  // Cash-in is the PAID unlock (ROLES.md §Entitlement; the Vault ✋→✅ gate). Accrual
  // runs for everyone; spending Gems / claiming rewards is gated on the real entitlement
  // column — never the (retired) community role (ADR-207/225). The store UI already mutes
  // the grid for free members (CrewGate), but the server action is the authority, so we
  // enforce it here too and hand back a clean upsell pointing at /upgrade.
  const tier = ((profile as { membership_tier?: EntitlementTier | null } | null)?.membership_tier) ?? 'free'
  if (!canCashIn(tier)) {
    return fail('Cashing in the Vault is a Crew perk. Upgrade at /upgrade to spend your Gems — you keep everything you’ve earned.')
  }

  // Season-exclusive + retiring SKUs (Rewards Economy v2): an S1 item stops
  // selling at season close; expires_at is a hard cutoff.
  if (item.expires_at && new Date(item.expires_at).getTime() < Date.now()) {
    return fail('This item has retired')
  }
  if (item.season_id !== null) {
    const { data: season } = await admin
      .from('seasons')
      .select('season_number')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if ((season?.season_number ?? null) !== item.season_id) {
      return fail('This item was a season exclusive and has retired')
    }
  }

  // Rank-gated SKUs (e.g. Founders' Table requires Conduit or above).
  const requiredRank = (item.metadata as { requires_rank?: string } | null)?.requires_rank
  if (requiredRank) {
    const order = ['ghost', 'echo', 'signal', 'beacon', 'conduit', 'luminary']
    const have = order.indexOf((profile?.current_season_rank as string | null) ?? 'ghost')
    if (have < order.indexOf(requiredRank)) {
      return fail(`Requires ${requiredRank.charAt(0).toUpperCase()}${requiredRank.slice(1)} rank or above`)
    }
  }

  // Capped SKUs: stock is the TOTAL sellable count (e.g. 12 Listening Room seats).
  if (item.stock !== null) {
    const { count: sold } = await admin
      .from('store_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId)
    if ((sold ?? 0) >= item.stock) return fail('Out of stock')
  }

  // Spendable balance = gems earned (lifetime) − gems already spent. lifetime_gems
  // is monotonic, so the difference is the real wallet (ADR-140 fix).
  const spent = (spends ?? []).reduce((s, r) => s + (r.gems_spent ?? 0), 0)
  const balance = (profile?.lifetime_gems ?? 0) - spent
  if (balance < item.gem_cost) {
    return fail(`Not enough gems. You need ${item.gem_cost - balance} more.`)
  }

  // Check if already purchased (for non-stackable items like cosmetics/titles)
  if (['cosmetic', 'title', 'collectible'].includes(item.category)) {
    const { data: existing } = await admin
      .from('store_redemptions')
      .select('id')
      .eq('profile_id', profileId)
      .eq('item_id', itemId)
      .maybeSingle()

    if (existing) return fail('You already own this item')
  }

  const { error } = await db.from('store_redemptions').insert({
    profile_id: profileId,
    item_id: itemId,
    gems_spent: item.gem_cost,
    metadata: item.metadata ?? {},
  })

  if (error) return fail(error.message)

  // Apply cosmetic effects
  const meta = item.metadata as { type?: string; value?: string } | null
  if (meta?.type === 'border') {
    await admin.from('profiles')
      .update({ profile_border: meta.value })
      .eq('id', profileId)
  } else if (meta?.type === 'flair') {
    await admin.from('profiles')
      .update({ profile_flair: meta.value })
      .eq('id', profileId)
  } else if (meta?.type === 'title') {
    await admin.from('profiles')
      .update({ custom_title: meta.value })
      .eq('id', profileId)
  }

  revalidatePath('/crew/store')
  revalidatePath('/crew')
  revalidatePath('/people', 'layout')
  return ok()
}

export async function equipCosmetic(type: 'border' | 'flair' | 'title', value: string | null) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const admin = createAdminClient()

  if (type === 'border') {
    await admin.from('profiles').update({ profile_border: value }).eq('id', profileId)
  } else if (type === 'flair') {
    await admin.from('profiles').update({ profile_flair: value }).eq('id', profileId)
  } else if (type === 'title') {
    await admin.from('profiles').update({ custom_title: value }).eq('id', profileId)
  }

  revalidatePath('/crew/store')
  revalidatePath('/people', 'layout')
}

export async function getStoreData() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const admin = createAdminClient()

  const [{ data: items }, { data: redemptions }, { data: profile }] = await Promise.all([
    admin.from('store_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    admin.from('store_redemptions')
      .select('item_id, redeemed_at, gems_spent')
      .eq('profile_id', profileId),
    admin.from('profiles')
      .select('lifetime_gems, profile_border, profile_flair, custom_title')
      .eq('id', profileId)
      .maybeSingle(),
  ])

  const ownedIds = new Set((redemptions ?? []).map(r => r.item_id))
  // Spendable balance = gems earned − gems spent (lifetime_gems is monotonic).
  const spent = (redemptions ?? []).reduce((s, r) => s + (r.gems_spent ?? 0), 0)

  // Hard-expired SKUs drop off the shelf (season-exclusive cutoffs are enforced
  // at redeem time, where the active season is known).
  const now = Date.now()
  const onShelf = (items ?? []).filter((i) => {
    const exp = (i as { expires_at?: string | null }).expires_at
    return !exp || new Date(exp).getTime() >= now
  })

  return {
    items: onShelf.map(item => ({
      ...item,
      owned: ownedIds.has(item.id),
    })),
    balance: Math.max(0, (profile?.lifetime_gems ?? 0) - spent),
    equipped: {
      border: profile?.profile_border ?? null,
      flair: profile?.profile_flair ?? null,
      title: profile?.custom_title ?? null,
    },
  }
}
