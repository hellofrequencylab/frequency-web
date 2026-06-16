import { Suspense } from 'react'
import Link from 'next/link'
import {
  Map,
  BookOpen,
  Trophy,
  CalendarRange,
  Sparkles,
  GraduationCap,
  ArrowUpRight,
  CheckCircle2,
  Scale,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip } from '@/components/admin/status'
import { StateBadge } from './seasons/state-badge'
import { getContentHomeData, type NeedsYouItem, type ContentHealth } from '@/lib/admin/content-home'

// The content suite HOME — the operator "needs you" workspace (QUEST-UI-REDESIGN §4.5/§A7):
// the work list that needs a decision today, a small at-a-glance health strip, and the
// doors into each working surface. A dashboard is glance-and-act, not an exploration tool
// (NN/g), so the action sits next to the metric: every "needs you" item links to the
// surface that fixes it, and every health number drills in. The ranked curation tables
// live on the dedicated sub-pages (/journeys, /practices), not here. Gate: host+ /
// community staff (each sub-surface keeps its own gate).

export default async function AdminContentPage() {
  const { webRole } = await requireAdmin('host', { staff: 'community' })
  const janitor = isJanitor(webRole)

  const doors = [
    { href: '/admin/content/seasons', label: 'Seasons', desc: 'The season calendar. Create the next one.', Icon: CalendarRange },
    { href: '/admin/content/journeys', label: 'Journeys', desc: 'Review queue, official marks, and what is performing.', Icon: Map },
    { href: '/admin/content/practices', label: 'Practices', desc: 'Library curation: visibility, weight class, and features.', Icon: BookOpen },
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
      description="The Quest at a glance: what needs a decision today, how the season is doing, and the doors into each working surface."
      width="default"
    >
      {/* Speed is structural: the home shell renders instantly; the data-backed strip
          and work list stream in behind one Suspense (PAGE-FRAMEWORK §5). */}
      <Suspense fallback={<HomeSkeleton />}>
        <ContentHomeBody />
      </Suspense>

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

async function ContentHomeBody() {
  const { health, needsYou } = await getContentHomeData()
  return (
    <>
      <HealthStrip health={health} />
      <NeedsYouList items={needsYou} />
    </>
  )
}

// --- The health strip: active season + headline counts (each drills in) ----------

function HealthStrip({ health }: { health: ContentHealth }) {
  const { season, seasonState, daysLeft } = health
  const seasonValue = season ? season.name : 'No season'
  const seasonDetail =
    season && daysLeft != null
      ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
      : season?.theme ?? 'Schedule the next one'

  return (
    <AdminSection>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          href={season ? `/admin/content/seasons/${season.id}` : '/admin/content/seasons'}
          className="block rounded-2xl bg-surface-elevated/60 px-3.5 py-2.5 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-bold text-text">{seasonValue}</p>
            <StateBadge state={season ? undefined : 'ended'} status={season?.status} size="sm" />
          </div>
          <p className="mt-1 text-xs font-medium text-muted">Active season</p>
          <p className="mt-0.5 text-xs text-subtle">
            {season ? `${seasonState.label} · ${seasonDetail}` : seasonDetail}
          </p>
        </Link>
        <StatCard
          label="Official journeys"
          value={health.officialJourneys}
          detail={`${health.rankedLibraryJourneys} ranked from the library`}
          icon={Map}
          href="/admin/content/journeys"
        />
        <StatCard
          label="Public practices"
          value={health.publicPractices}
          detail={
            health.practicesUncategorized > 0
              ? `${health.practicesUncategorized} need a Pillar`
              : 'All sorted into Pillars'
          }
          icon={BookOpen}
          href="/admin/content/practices"
        />
        <PillarSpreadCard health={health} />
      </div>
    </AdminSection>
  )
}

/** The Pillar balance at a glance: the four public-practice counts, flagging any Pillar
 *  that is thin so the library stays balanced across Mind / Body / Spirit / Expression. */
function PillarSpreadCard({ health }: { health: ContentHealth }) {
  const spread = health.pillarSpread
  const max = Math.max(0, ...spread.map((p) => p.count))
  const thin = spread.filter((p) => p.count < max).map((p) => p.name)
  return (
    <Link
      href="/admin/content/practices"
      className="block rounded-2xl bg-surface-elevated/60 px-3.5 py-2.5 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold tabular-nums text-text">
          {spread.length > 0 ? spread.map((p) => p.count).join(' · ') : '0'}
        </p>
        <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
      </div>
      <p className="mt-1 text-xs font-medium text-muted">Pillar spread</p>
      <p className="mt-0.5 text-xs text-subtle">
        {spread.length === 0
          ? 'Mind · Body · Spirit · Expression'
          : thin.length === 0
            ? 'Balanced across Pillars'
            : `Thin: ${thin.join(', ')}`}
      </p>
    </Link>
  )
}

// --- The "needs you" work list ----------------------------------------------------

function NeedsYouList({ items }: { items: NeedsYouItem[] }) {
  return (
    <AdminSection
      title="Needs you"
      description="Actionable items, most urgent first. Each opens the surface that fixes it."
    >
      {items.length === 0 ? (
        <EmptyState
          variant="cleared"
          title="All clear"
          description="Nothing is waiting on a decision. The season, Journeys, challenges, and the library are in good shape."
        />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id} className="border-b border-border/50 last:border-b-0">
              <Link
                href={item.href}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated/60 motion-reduce:transition-none"
              >
                <StatusChip tone={item.tone} size="sm">
                  {item.tone === 'warning' ? 'Act' : 'Review'}
                </StatusChip>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{item.detail}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  )
}

// --- Loading skeleton (matches the strip + list shape) ---------------------------

function HomeSkeleton() {
  return (
    <>
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[4.5rem] animate-pulse rounded-2xl bg-surface-elevated/60" />
          ))}
        </div>
      </AdminSection>
      <AdminSection title="Needs you">
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-8 text-sm text-subtle">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Checking what needs a decision…
        </div>
      </AdminSection>
    </>
  )
}
