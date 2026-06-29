import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Library,
  TrendingUp,
  Users,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ChartCard, TrendArea, WeekBars, RingGauge } from '@/components/admin/spark-charts'
import { getLibraryHealth, type FunnelMetrics } from '@/lib/practices/health'

// Library health dashboard (BUILD-LIST Practice Library §4.3). A READ-ONLY operator view of the
// practice library's vital signs: growth over time, coverage gaps by Pillar/sub-category, the
// adoption funnel, top/bottom performers, the review SLA, and the contributor leaderboard. Every
// number is computed from existing tables by lib/practices/health.ts (no writes, no migration).
//
// Composes the shared DashboardTemplate (PAGE-FRAMEWORK §8.1) + the kit primitives (StatCard,
// SectionHeader, the pure-SVG spark-charts) on DAWN tokens — no hand-rolled stat tiles, no hex.
// /admin/* already resolves to the no-rail operator chrome (page-chrome.ts), so there is nothing
// to register. The page gates entry with the SAME guard the rest of the practices admin uses.
export default async function PracticeLibraryHealthPage() {
  await requireAdmin('host', { staff: 'community' })

  const health = await getLibraryHealth({ weeks: 12 })
  const { growth, coverage, funnel, performers, reviewSla, contributors } = health

  const activePct = Math.round(funnel.activeRate * 100)
  const slaTone = reviewSla.overdue > 0 ? 'down' : reviewSla.aging > 0 ? 'flat' : 'up'

  return (
    <DashboardTemplate
      eyebrow="Content"
      title="Library health"
      back={{ href: '/admin/content/practices', label: 'Practices' }}
      description="A read-only read on the practice library: how it is growing, where the coverage gaps are, what is getting used, and how fast submissions clear review."
      width="wide"
      stats={
        <>
          <StatCard
            label="Published practices"
            value={growth.totalPublished}
            icon={Library}
            delta={{
              label: `+${growth.addedThisWeek} this week`,
              trend: growth.addedThisWeek > 0 ? 'up' : 'flat',
            }}
          />
          <StatCard
            label="Active this month"
            value={`${activePct}%`}
            icon={Activity}
            detail={`${funnel.loggedRecently} logged in 30 days`}
          />
          <StatCard
            label="Coverage gaps"
            value={coverage.totalEmptySubcategories}
            icon={AlertTriangle}
            detail="empty sub-categories"
          />
          <StatCard
            label="Pending review"
            value={reviewSla.pending}
            icon={CheckCircle2}
            delta={{
              label:
                reviewSla.overdue > 0
                  ? `${reviewSla.overdue} over a week`
                  : reviewSla.pending > 0
                    ? `oldest ${reviewSla.oldestDays}d`
                    : 'queue clear',
              trend: slaTone,
            }}
          />
        </>
      }
    >
      {/* Growth + funnel side by side. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHeader title="Growth over time" />
          <ChartCard
            title="Library size"
            value={`${growth.totalPublished} practices`}
            delta={growth.addedThisWeek > 0 ? `+${growth.addedThisWeek} this week` : undefined}
            caption={`${health.weeks} weeks ago → now`}
          >
            <div className="h-28">
              <TrendArea points={growth.cumulative} height={112} />
            </div>
          </ChartCard>
          <div className="mt-3">
            <ChartCard title="Added per week" caption={`last ${health.weeks} weeks`}>
              <div className="h-16">
                <WeekBars values={growth.weeklyAdds} height={64} />
              </div>
            </ChartCard>
          </div>
        </div>

        <div>
          <SectionHeader title="Adoption funnel" />
          <Funnel funnel={funnel} />
        </div>
      </section>

      {/* Coverage matrix. */}
      <section>
        <SectionHeader title="Coverage by Pillar" count={coverage.totalEmptySubcategories} />
        {coverage.pillars.length === 0 ? (
          <EmptyState variant="no-results" title="No Pillars yet" description="Add Pillars and sub-categories to map coverage." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {coverage.pillars.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-text">{p.name}</p>
                  <p className="text-sm font-bold tabular-nums text-text">{p.count}</p>
                </div>
                <p className="mt-0.5 text-xs text-subtle">
                  {p.subcategories.length} sub-categories · {p.emptySubcategories.length} empty
                </p>
                <ul className="mt-3 space-y-1.5">
                  {p.subcategories.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className={s.count === 0 ? 'text-danger' : 'text-muted'}>{s.name}</span>
                      <span className={`tabular-nums ${s.count === 0 ? 'font-semibold text-danger' : 'text-subtle'}`}>
                        {s.count}
                      </span>
                    </li>
                  ))}
                  {p.subcategories.length === 0 && <li className="text-xs text-subtle">No sub-categories</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
        {coverage.unpilared > 0 && (
          <p className="mt-3 text-xs text-muted">
            {coverage.unpilared} published practice{coverage.unpilared === 1 ? '' : 's'} with no Pillar set.
          </p>
        )}
      </section>

      {/* Top + bottom performers. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHeader title="Top performers" />
          {performers.top.length === 0 ? (
            <EmptyState variant="first-use" title="No logs in the last 30 days" description="Once practices get logged, the busiest ones show up here." />
          ) : (
            <PerformerList rows={performers.top} metric="this month" />
          )}
        </div>
        <div>
          <SectionHeader title="Needs a push" />
          {performers.bottom.length === 0 ? (
            <EmptyState variant="cleared" title="Everything is getting logged" description="No published practice has been idle this month." />
          ) : (
            <PerformerList rows={performers.bottom} metric="all time" idle />
          )}
        </div>
      </section>

      {/* Review SLA + contributor leaderboard. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHeader title="Review SLA" count={reviewSla.pending} />
          <div className="rounded-2xl border border-border bg-surface p-4">
            <RingGauge
              pct={reviewSla.pending > 0 ? reviewSla.overdue / reviewSla.pending : 0}
              label={reviewSla.overdue > 0 ? `${reviewSla.overdue} over a week` : 'On track'}
              sub={
                reviewSla.pending > 0
                  ? `${reviewSla.pending} pending · oldest ${reviewSla.oldestDays} days`
                  : 'No submissions waiting'
              }
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <SlaBucket label="Fresh" sub="< 2 days" value={reviewSla.fresh} tone="text-success" />
              <SlaBucket label="Aging" sub="2 to 7 days" value={reviewSla.aging} tone="text-text" />
              <SlaBucket label="Overdue" sub="7+ days" value={reviewSla.overdue} tone="text-danger" />
            </div>
          </div>
        </div>

        <div>
          <SectionHeader title="Top contributors" />
          {contributors.length === 0 ? (
            <EmptyState variant="first-use" title="No contributors yet" description="Authors of published practices show up here." />
          ) : (
            <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {contributors.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-subtle">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{c.displayName}</p>
                    {c.handle && <p className="truncate text-xs text-subtle">@{c.handle}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-text">{c.published}</p>
                    <p className="text-2xs text-subtle">published</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-muted">{c.reach30d}</p>
                    <p className="text-2xs text-subtle">logs 30d</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </DashboardTemplate>
  )
}

// --- Local presentational pieces (this page only; no shared kit changes) -----

function Funnel({ funnel }: { funnel: FunnelMetrics }) {
  const steps = [
    { label: 'Published', value: funnel.published, share: 1 },
    { label: 'Adopted by a member', value: funnel.adopted, share: funnel.adoptedRate },
    { label: 'Logged at least once', value: funnel.logged, share: funnel.loggedRate },
    { label: 'Logged in 30 days', value: funnel.loggedRecently, share: funnel.activeRate },
  ]
  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-4">
      {steps.map((s) => (
        <div key={s.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-muted">{s.label}</span>
            <span className="text-xs tabular-nums text-subtle">
              {s.value}
              <span className="ml-1.5 text-2xs">{Math.round(s.share * 100)}%</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(s.share * 100, s.value > 0 ? 2 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function PerformerList({
  rows,
  metric,
  idle = false,
}: {
  rows: { id: string; title: string; logs_30d: number; logs_total: number; adopters: number }[]
  metric: string
  idle?: boolean
}) {
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{r.title}</p>
            <p className="text-xs text-subtle">{r.adopters} adopters</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-sm font-bold tabular-nums ${idle ? 'text-subtle' : 'text-text'}`}>
              {idle ? r.logs_total : r.logs_30d}
            </p>
            <p className="text-2xs text-subtle">logs {metric}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function SlaBucket({ label, sub, value, tone }: { label: string; sub: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-surface-elevated/60 px-2 py-3">
      <p className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
      <p className="text-2xs text-subtle">{sub}</p>
    </div>
  )
}
