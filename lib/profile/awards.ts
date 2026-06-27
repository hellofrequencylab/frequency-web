import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// A member's PUBLIC awards + owned items for their profile: real earned achievements
// (user_achievements × achievements) and store items they own (store_redemptions ×
// store_items), split into bought (gems_spent > 0) vs awarded/granted (gems_spent = 0).
// Read through the admin client behind app-code authz, matching lib/profile-zaps.ts — the
// profile page already uses the admin client, and both tables allow crew+/host+ reads.

export interface ProfileAchievement {
  slug: string
  name: string
  description: string | null
  icon: string | null
  tier: string | null
  unlockedAt: string | null
}
export interface ProfileItem {
  slug: string
  name: string
  description: string | null
  icon: string | null
  category: string | null
  bought: boolean // true = bought with gems; false = awarded/granted
}

export interface ProfileAwards {
  achievements: ProfileAchievement[]
  items: ProfileItem[]
}

export async function getProfileAwards(profileId: string): Promise<ProfileAwards> {
  const admin = createAdminClient()
  const [achievementsRes, itemsRes] = await Promise.all([
    admin
      .from('user_achievements')
      .select('unlocked_at, achievements!achievement_id ( slug, name, description, icon, tier )')
      .eq('profile_id', profileId)
      .order('unlocked_at', { ascending: false }),
    admin
      .from('store_redemptions')
      .select('gems_spent, redeemed_at, store_items!item_id ( slug, name, description, icon, category )')
      .eq('profile_id', profileId)
      .order('redeemed_at', { ascending: false }),
  ])

  const achievements: ProfileAchievement[] = ((achievementsRes.data ?? []) as unknown as {
    unlocked_at: string | null
    achievements: { slug: string; name: string; description: string | null; icon: string | null; tier: string | null } | null
  }[])
    .filter((r) => r.achievements)
    .map((r) => ({
      slug: r.achievements!.slug,
      name: r.achievements!.name,
      description: r.achievements!.description,
      icon: r.achievements!.icon,
      tier: r.achievements!.tier,
      unlockedAt: r.unlocked_at,
    }))

  const items: ProfileItem[] = ((itemsRes.data ?? []) as unknown as {
    gems_spent: number | null
    store_items: { slug: string; name: string; description: string | null; icon: string | null; category: string | null } | null
  }[])
    .filter((r) => r.store_items)
    .map((r) => ({
      slug: r.store_items!.slug,
      name: r.store_items!.name,
      description: r.store_items!.description,
      icon: r.store_items!.icon,
      category: r.store_items!.category,
      bought: (r.gems_spent ?? 0) > 0,
    }))

  return { achievements, items }
}
