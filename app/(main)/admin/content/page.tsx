import Link from 'next/link'
import {
  Map,
  BookOpen,
  Trophy,
  CalendarRange,
  Star,
  Inbox,
  Sparkles,
  GraduationCap,
  ArrowUpRight,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { rankedJourneys, rankedPractices } from '@/lib/admin/content-signals'
import type { RankedJourney, RankedPracticeSignal } from '@/lib/admin/content-signals'
import {
  JourneyFeatureToggle,
  JourneyOfficialControl,
  PracticeFeatureToggle,
} from './content-controls'

// The content suite home — an INDEX / navigation hub (ADR-233 §3.3): what's performing
// across member-created Journeys and Practices, the curation numbers at a glance (each
// number drills), and the doors to each sub-surface. Tables compose the shared
// DataTable; status would speak via StatusChip (these ranked rows carry no status).

export default async function AdminContentPage() {
  const { webRole } = await requireAdmin('host', { staff: 'community' })
  const janitor = isJanitor(webRole)

  const admin = createAdminClient()
  const ub = admin

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

  const quests = (questRows ?? []) as { id: string; name: string }[]
  const pendingTotal = (pendingJourneys ?? 0) + (pendingPractices ?? 0)
  const topJourneys = journeys.filter((j) => j.author_id && j.status === 'approved').slice(0, 6)
  const topPractices = practices.filter((p) => p.created_by && p.is_public).slice(0, 6)

  const journeyColumns: ColumnDef<RankedJourney>[] = [
    {
      key: 'title',
      header: 'Journey',
      render: (j) => (
        <Link href={`/journeys/${j.slug}`} className="font-medium text-text hover:underline">
          {j.emoji ? `${j.emoji} ` : ''}
          {j.title}
        </Link>
      ),
    },
    {
      key: 'author',
      header: 'Author',
      render: (j) => (
        <span className="text-muted">{j.author?.display_name ?? j.author?.handle ?? 'Unknown'}</span>
      ),
    },
    {
      key: 'signal',
      header: 'Signal',
      render: (j) => (
        <span className="tabular-nums text-muted">
          {j.adopt_count} adopted, {j.active_adoptions} active, {j.forked_count} remixed
        </span>
      ),
    },
    {
      key: 'official',
      header: 'Official',
      render: (j) => (
        <JourneyOfficialControl id={j.id} official={j.official} questId={j.quest_id} quests={quests} />
      ),
    },
    {
      key: 'feature',
      header: 'Feature',
      align: 'center',
      render: (j) => <JourneyFeatureToggle id={j.id} featured={!!j.featured_at} />,
    },
  ]

  const practiceColumns: ColumnDef<RankedPracticeSignal>[] = [
    {
      key: 'title',
      header: 'Practice',
      render: (p) => (
        <Link href={`/practices/${p.id}`} className="font-medium text-text hover:underline">
          {p.title}
        </Link>
      ),
    },
    {
      key: 'creator',
      header: 'Creator',
      render: (p) => (
        <span className="text-muted">{p.creator?.display_name ?? p.creator?.handle ?? 'Unknown'}</span>
      ),
    },
    {
      key: 'signal',
      header: 'Signal',
      render: (p) => (
        <span className="tabular-nums text-muted">
          {p.adopters} adopters, {p.logs_30d} logs in 30d, {p.logs_total} all time
        </span>
      ),
    },
    {
      key: 'feature',
      header: 'Feature',
      align: 'center',
      render: (p) => <PracticeFeatureToggle id={p.id} featured={!!p.featured_at} />,
    },
  ]

  const doors = [
    { href: '/admin/content/seasons', label: 'Seasons', desc: 'The season calendar. Create the next one.', Icon: CalendarRange },
    { href: '/admin/content/journeys', label: 'Journeys', desc: 'Review queue, official marks, features.', Icon: Map },
    { href: '/admin/content/practices', label: 'Practices', desc: 'Library curation. Visibility, templates, features.', Icon: BookOpen },
    { href: '/admin/content/challenges', label: 'Challenges', desc: 'Edit and add this season’s challenges.', Icon: Trophy },
    { href: '/admin/content/training', label: 'Role training', desc: 'The advancement curriculum each promotion teaches.', Icon: GraduationCap },
    ...(janitor
      ? [{ href: '/admin/content/tips', label: 'Vera’s tips', desc: 'Draft tips to creators. Review and send.', Icon: Sparkles }]
      : []),
  ]

  return (
    <AdminTemplate
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
            href="/admin/content/journeys"
          />
          <StatCard
            label="Featured"
            value={(featuredJourneys ?? 0) + (featuredPractices ?? 0)}
            detail={`${featuredJourneys ?? 0} journeys, ${featuredPractices ?? 0} practices`}
            icon={Star}
            href="/admin/content/practices"
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Top member journeys"
        description="Ranked by adoption, remixes, and active members. Feature or promote the ones that earn it."
        actions={
          <Link href="/admin/content/journeys" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong hover:underline">
            All journeys <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        <DataTable
          caption="Top member journeys"
          rows={topJourneys}
          getRowId={(j) => j.id}
          columns={journeyColumns}
          empty={
            <EmptyState
              variant="first-use"
              icon={Map}
              title="No member journeys yet"
              description="Public journeys built by members will rank here as they get adopted."
            />
          }
        />
      </AdminSection>

      <AdminSection
        title="Top member practices"
        description="Ranked by adopters and recent logs from the library."
        actions={
          <Link href="/admin/content/practices" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong hover:underline">
            All practices <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        <DataTable
          caption="Top member practices"
          rows={topPractices}
          getRowId={(p) => p.id}
          columns={practiceColumns}
          empty={
            <EmptyState
              variant="first-use"
              icon={BookOpen}
              title="No member practices yet"
              description="Public practices created by members will rank here as they get adopted and logged."
            />
          }
        />
      </AdminSection>

      <AdminSection title="Work in the suite">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {doors.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-3 rounded-2xl bg-surface-elevated/60 p-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold text-text">
                  {label}
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="mt-0.5 block text-xs text-muted">{desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}
