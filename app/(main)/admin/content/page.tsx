import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Map,
  BookOpen,
  Trophy,
  CalendarRange,
  Star,
  Inbox,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { rankedJourneys, rankedPractices } from '@/lib/admin/content-signals'
import {
  JourneyFeatureToggle,
  JourneyOfficialControl,
  PracticeFeatureToggle,
} from './content-controls'

// The content suite home: what's performing across member-created Journeys and
// Practices, the curation numbers at a glance, and the doors to each sub-surface.

export default async function AdminContentPage() {
  const { webRole } = await requireAdmin('host', { staff: 'community' })
  const janitor = isJanitor(webRole)

  const admin = createAdminClient()
  const ub = admin as unknown as SupabaseClient

  const [
    season,
    journeys,
    practices,
    { count: officialCount },
    { count: pendingJourneys },
    { count: pendingPractices },
    { count: featuredJourneys },
    { count: featuredPractices },
    { data: questRows },
  ] = await Promise.all([
    getCurrentSeason(),
    rankedJourneys(),
    rankedPractices(),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ub.from('practices').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ub.from('journey_plans').select('id', { count: 'exact', head: true }).not('featured_at', 'is', null),
    ub.from('practices').select('id', { count: 'exact', head: true }).not('featured_at', 'is', null),
    ub.from('quests').select('id, name').eq('status', 'active').order('sort_order'),
  ] as const)

  const quests = ((questRows ?? []) as { id: string; name: string }[])
  const pendingTotal = (pendingJourneys ?? 0) + (pendingPractices ?? 0)
  const topJourneys = journeys.filter((j) => j.author_id && j.status === 'approved').slice(0, 6)
  const topPractices = practices.filter((p) => p.created_by && p.is_public).slice(0, 6)

  const doors = [
    { href: '/admin/content/seasons', label: 'Seasons', desc: 'The season calendar. Create the next one.', Icon: CalendarRange },
    { href: '/admin/content/journeys', label: 'Journeys', desc: 'Review queue, official marks, features.', Icon: Map },
    { href: '/admin/content/practices', label: 'Practices', desc: 'Library curation. Visibility, templates, features.', Icon: BookOpen },
    { href: '/admin/content/challenges', label: 'Challenges', desc: 'Edit and add this season’s challenges.', Icon: Trophy },
    ...(janitor
      ? [{ href: '/admin/content/tips', label: 'Vera’s tips', desc: 'Draft tips to creators. Review and send.', Icon: Sparkles }]
      : []),
  ]

  return (
    <AdminPage
      title="Content"
      eyebrow="Engage"
      description="Curate the Quest: seasons, official Journeys, the practice library, and challenges. Member-created content that performs rises here."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Active season"
            value={season ? season.name : 'None'}
            detail={season?.theme ?? undefined}
            icon={CalendarRange}
            size="sm"
            href="/admin/content/seasons"
          />
          <StatCard label="Official journeys" value={officialCount ?? 0} icon={Map} href="/admin/content/journeys" />
          <StatCard
            label="Pending reviews"
            value={pendingTotal}
            detail={`${pendingJourneys ?? 0} journeys, ${pendingPractices ?? 0} practices`}
            icon={Inbox}
          />
          <StatCard
            label="Featured"
            value={(featuredJourneys ?? 0) + (featuredPractices ?? 0)}
            detail={`${featuredJourneys ?? 0} journeys, ${featuredPractices ?? 0} practices`}
            icon={Star}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Top member journeys"
        description="Ranked by adoption, remixes, and active members. Feature or promote the ones that earn it."
        actions={
          <Link href="/admin/content/journeys" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            All journeys <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {topJourneys.length === 0 ? (
          <EmptyState icon={Map} title="No member journeys yet" description="Public journeys built by members will rank here as they get adopted." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="hidden border-b border-border px-4 py-2 sm:grid sm:grid-cols-[1fr_130px_170px_130px_70px] sm:items-center sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Journey</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Author</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Signal</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Official</span>
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">Feature</span>
            </div>
            <div className="divide-y divide-border/50">
              {topJourneys.map((j) => (
                <div
                  key={j.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_130px_170px_130px_70px] sm:gap-4"
                >
                  <div className="min-w-0">
                    <Link href={`/journeys/${j.slug}`} className="truncate text-sm font-medium text-text hover:underline">
                      {j.emoji ? `${j.emoji} ` : ''}{j.title}
                    </Link>
                  </div>
                  <span className="hidden truncate text-xs text-muted sm:block">
                    {j.author?.display_name ?? j.author?.handle ?? 'Unknown'}
                  </span>
                  <span className="hidden text-xs tabular-nums text-muted sm:block">
                    {j.adopt_count} adopted, {j.active_adoptions} active, {j.forked_count} remixed
                  </span>
                  <div className="hidden sm:block">
                    <JourneyOfficialControl id={j.id} official={j.official} questId={j.quest_id} quests={quests} />
                  </div>
                  <div className="flex justify-center">
                    <JourneyFeatureToggle id={j.id} featured={!!j.featured_at} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="Top member practices"
        description="Ranked by adopters and recent logs from the library."
        actions={
          <Link href="/admin/content/practices" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            All practices <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {topPractices.length === 0 ? (
          <EmptyState icon={BookOpen} title="No member practices yet" description="Public practices created by members will rank here as they get adopted and logged." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="hidden border-b border-border px-4 py-2 sm:grid sm:grid-cols-[1fr_130px_200px_70px] sm:items-center sm:gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Practice</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Creator</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Signal</span>
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-subtle">Feature</span>
            </div>
            <div className="divide-y divide-border/50">
              {topPractices.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_130px_200px_70px] sm:gap-4"
                >
                  <Link href={`/practices/${p.id}`} className="min-w-0 truncate text-sm font-medium text-text hover:underline">
                    {p.title}
                  </Link>
                  <span className="hidden truncate text-xs text-muted sm:block">
                    {p.creator?.display_name ?? p.creator?.handle ?? 'Unknown'}
                  </span>
                  <span className="hidden text-xs tabular-nums text-muted sm:block">
                    {p.adopters} adopters, {p.logs_30d} logs in 30d, {p.logs_total} all time
                  </span>
                  <div className="flex justify-center">
                    <PracticeFeatureToggle id={p.id} featured={!!p.featured_at} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Work in the suite">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {doors.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-elevated"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary-strong" />
                <span className="text-sm font-semibold text-text">{label}</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-xs text-muted">{desc}</p>
            </Link>
          ))}
        </div>
      </AdminSection>
    </AdminPage>
  )
}
