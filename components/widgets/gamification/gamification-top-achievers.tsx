import Link from 'next/link'
import { Award, Flame, Zap, Users } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'

// Gamification layout module (LP7): the top-achievers leaderboard — the five members with the most
// achievements, each linking to their profile. Self-fetching, fail-safe RSC; the page owns the host +
// community-staff gate, so this never re-gates. An empty leaderboard shows its first-use empty state.

type TopEarner = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'handle' | 'achievement_count' | 'lifetime_zaps' | 'current_streak'
>

export async function GamificationTopAchievers() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, display_name, handle, achievement_count, lifetime_zaps, current_streak')
    .order('achievement_count', { ascending: false })
    .limit(5)

  const topEarners = (data ?? []) as TopEarner[]

  return (
    <AdminSection title="Top achievers">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {topEarners.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon={Users}
            title="No achievements earned yet"
            description="Members who unlock achievements will appear here."
          />
        ) : (
          <div>
            {topEarners.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < topEarners.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <span className="text-sm font-bold text-subtle w-5 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <Link href={`/people/${p.handle}`} className="text-sm font-medium text-text hover:underline truncate block">
                    {p.display_name}
                  </Link>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted">
                  <span className="flex items-center gap-1 tabular-nums">
                    <Award className="w-3 h-3 text-signal" aria-hidden />
                    {p.achievement_count ?? 0}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Zap className="w-3 h-3 text-primary" aria-hidden />
                    {(p.lifetime_zaps ?? 0).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Flame className="w-3 h-3 text-primary" aria-hidden />
                    {p.current_streak ?? 0}w
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminSection>
  )
}
