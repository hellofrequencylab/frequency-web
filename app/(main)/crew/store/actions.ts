'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export async function redeemItem(itemId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not authenticated')

  const admin = createAdminClient()

  const [{ data: item }, { data: profile }] = await Promise.all([
    admin.from('store_items')
      .select('id, slug, gem_cost, stock, is_active, metadata, category')
      .eq('id', itemId)
      .maybeSingle(),
    admin.from('profiles')
      .select('id, lifetime_gems')
      .eq('id', profileId)
      .maybeSingle(),
  ])

  if (!item) return fail('Item not found')
  if (!item.is_active) return fail('Item is no longer available')
  if (item.stock !== null && item.stock <= 0) return fail('Out of stock')

  const gems = (profile as any)?.lifetime_gems ?? 0
  if (gems < item.gem_cost) {
    return fail(`Not enough gems. You need ${item.gem_cost - gems} more.`)
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

  const { error } = await admin.from('store_redemptions').insert({
    profile_id: profileId,
    item_id: itemId,
    gems_spent: item.gem_cost,
    metadata: item.metadata,
  })

  if (error) return fail(error.message)

  // Apply cosmetic effects
  const meta = item.metadata as any
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
      .select('item_id, redeemed_at')
      .eq('profile_id', profileId),
    admin.from('profiles')
      .select('lifetime_gems, profile_border, profile_flair, custom_title')
      .eq('id', profileId)
      .maybeSingle(),
  ])

  const ownedIds = new Set((redemptions ?? []).map(r => r.item_id))

  return {
    items: (items ?? []).map(item => ({
      ...item,
      owned: ownedIds.has(item.id),
    })),
    balance: (profile as any)?.lifetime_gems ?? 0,
    equipped: {
      border: (profile as any)?.profile_border ?? null,
      flair: (profile as any)?.profile_flair ?? null,
      title: (profile as any)?.custom_title ?? null,
    },
  }
}
