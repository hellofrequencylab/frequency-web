import { Award, Target, Flame, Trophy } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { createAdminClient } from '@/lib/supabase/admin'

// Gamification layout module (LP7): the four headline counts — achievements, times unlocked, season
// challenges, and challenges completed. Self-fetching, fail-safe RSC; the page owns the host +
// community-staff gate, so this never re-gates. Any read that comes back empty degrades to 0.
export async function GamificationStats() {
  const admin = createAdminClient()
  const [
    { count: totalAchievements },
    { count: totalUnlocked },
    { count: totalChallenges },
    { count: totalChallengesCompleted },
  ] = await Promise.all([
    admin.from('achievements').select('id', { count: 'exact', head: true }),
    admin.from('user_achievements').select('id', { count: 'exact', head: true }),
    admin.from('season_challenges').select('id', { count: 'exact', head: true }),
    admin.from('challenge_progress').select('id', { count: 'exact', head: true }).not('completed_at', 'is', null),
  ])

  return (
    <AdminSection>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Achievements" value={totalAchievements ?? 0} icon={Award} />
        <StatCard label="Times unlocked" value={totalUnlocked ?? 0} icon={Trophy} />
        <StatCard label="Season challenges" value={totalChallenges ?? 0} icon={Target} />
        <StatCard label="Challenges completed" value={totalChallengesCompleted ?? 0} icon={Flame} />
      </div>
    </AdminSection>
  )
}
