import { Suspense } from 'react'
import { CalendarDays, BookOpen, ClipboardCheck, Target, Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { AdminAreaGrid } from '@/components/admin/admin-area-grid'
import { groupLinks } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { pendingReviewCount } from '@/lib/library'
import { getOutcomeReport } from '@/lib/analytics/outcomes'

// Programs — "the game." The domain dashboard for content, seasons, rewards, crews,
// and leader training. Gate: host+ with the community staff domain (curation); the
// rewards/tips areas keep their own stricter gates at their pages. KPIs on top,
// areas of focus underneath. Each slow stat sits behind its own Suspense so the
// shell never blocks (PAGE-FRAMEWORK §5).

export default async function ProgramsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })
  const links = groupLinks('programs', role, webRole, staffRole)

  return (
    <AdminPage
      title="Programs"
      eyebrow="Domain"
      icon={Sparkles}
      description="The game. Content, seasons, rewards, and the crews that run them."
    >
      <AdminSection title="At a glance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Suspense fallback={<StatCard label="Active season" value="…" icon={CalendarDays} />}>
            <SeasonStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Official journeys" value="…" icon={BookOpen} />}>
            <OfficialJourneysStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Pending reviews" value="…" icon={ClipboardCheck} />}>
            <PendingReviewStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Challenge completion" value="…" icon={Target} />}>
            <ChallengeCompletionStat />
          </Suspense>
        </div>
      </AdminSection>

      <AdminSection title="Areas of focus" description="Everything in Programs you can manage.">
        <AdminAreaGrid links={links} />
      </AdminSection>
    </AdminPage>
  )
}

async function SeasonStat() {
  const season = await getCurrentSeason()
  return (
    <StatCard
      label="Active season"
      value={season ? season.name : 'None'}
      icon={CalendarDays}
      delta={season ? { label: `Season ${season.season_number}`, trend: 'flat' } : undefined}
    />
  )
}

async function OfficialJourneysStat() {
  const admin = createAdminClient()
  const { count } = await admin
    .from('journey_plans')
    .select('id', { count: 'exact', head: true })
    .eq('official', true)
  return <StatCard label="Official journeys" value={(count ?? 0).toLocaleString()} icon={BookOpen} />
}

async function PendingReviewStat() {
  const pending = await pendingReviewCount()
  return <StatCard label="Pending reviews" value={pending.toLocaleString()} icon={ClipboardCheck} href="/admin/content" />
}

async function ChallengeCompletionStat() {
  const report = await getOutcomeReport()
  const rated = report.challenges.filter((c) => c.rate !== null)
  const avg =
    rated.length > 0 ? Math.round(rated.reduce((s, c) => s + (c.rate ?? 0), 0) / rated.length) : null
  return (
    <StatCard
      label="Challenge completion"
      value={avg === null ? '–' : `${avg}%`}
      icon={Target}
      delta={rated.length > 0 ? { label: `${rated.length} active`, trend: 'flat' } : undefined}
    />
  )
}
