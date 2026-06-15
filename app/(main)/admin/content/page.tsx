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
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'

// The content suite HOME — a lean navigation hub (ADR-267, cleanup pass): the at-a-glance
// curation numbers (each drills in) + the doors to each working surface. The ranked
// curation tables (top member Journeys/Practices with feature/official toggles) are NOT
// duplicated here any more — that curation lives on the dedicated sub-pages
// (/admin/content/journeys + /practices), which the stats and doors link straight into.
// Stripped to its primary functions so a fuller Content Studio can build out from a clean
// base (BACKLOG P3). Gate: host+ / community staff (each sub-surface keeps its own gate).

export default async function AdminContentPage() {
  const { webRole } = await requireAdmin('host', { staff: 'community' })
  const janitor = isJanitor(webRole)

  const admin = createAdminClient()
  const [
    season,
    { count: officialCount },
    { count: pendingJourneys },
    { count: pendingPractices },
    { count: featuredJourneys },
    { count: featuredPractices },
  ] = await Promise.all([
    getCurrentSeason(),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('official', true),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('practices').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).not('featured_at', 'is', null),
    admin.from('practices').select('id', { count: 'exact', head: true }).not('featured_at', 'is', null),
  ] as const)

  const pendingTotal = (pendingJourneys ?? 0) + (pendingPractices ?? 0)

  const doors = [
    { href: '/admin/content/seasons', label: 'Seasons', desc: 'The season calendar. Create the next one.', Icon: CalendarRange },
    { href: '/admin/content/journeys', label: 'Journeys', desc: 'Review queue, official marks, and what is performing.', Icon: Map },
    { href: '/admin/content/practices', label: 'Practices', desc: 'Library curation: visibility, templates, and features.', Icon: BookOpen },
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
      description="Curate the Quest: seasons, official Journeys, the practice library, and challenges. Open a surface to do the work."
      width="default"
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

      <AdminSection title="Work in the suite" description="Each surface is where the real curation happens.">
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
