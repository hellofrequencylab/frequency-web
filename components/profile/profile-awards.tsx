import { Award, Gift, ShoppingBag } from 'lucide-react'
import { TIER_CONFIG } from '@/lib/gamification'
import type { AchievementTier } from '@/lib/gamification'
import type { ProfileAwards } from '@/lib/profile/awards'

const KNOWN_TIERS: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum']
function tierStyle(tier: string | null) {
  const t = (tier && (KNOWN_TIERS as string[]).includes(tier) ? tier : 'bronze') as AchievementTier
  const c = TIER_CONFIG[t]
  return `${c.bg} ${c.color} ${c.border}`
}

// A member's earned awards + owned/awarded shop items, shown on their public profile.
// Awards = real user_achievements (tier-coloured chips); Items = store_redemptions split
// into bought (gems) vs awarded/granted cosmetics. Renders nothing when both are empty.
export function ProfileAwards({ awards, firstName, isOwner }: { awards: ProfileAwards; firstName: string; isOwner: boolean }) {
  const { achievements, items } = awards
  if (achievements.length === 0 && items.length === 0) return null
  const who = isOwner ? 'Your' : `${firstName}’s`

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      {achievements.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-bold tracking-tight text-text">
            {who} awards <span className="font-medium text-subtle">· {achievements.length}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {achievements.map((a) => (
              <span
                key={a.slug}
                title={a.description ?? a.name}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tierStyle(a.tier)}`}
              >
                <Award className="h-3.5 w-3.5" />
                {a.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold tracking-tight text-text">
            {who} collection <span className="font-medium text-subtle">· {items.length}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map((it) => (
              <span
                key={it.slug}
                title={it.description ?? it.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-xs font-medium text-text"
              >
                {it.bought ? <ShoppingBag className="h-3.5 w-3.5 text-subtle" /> : <Gift className="h-3.5 w-3.5 text-subtle" />}
                {it.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
