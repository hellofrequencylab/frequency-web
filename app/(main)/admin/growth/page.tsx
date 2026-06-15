import { Fragment, Suspense } from 'react'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ArrowUpRight, TrendingUp } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { dashCookie, sanitizeDashOrder } from '../dash-sections'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { TrendArea, WeekBars, RingGauge, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { groupLinks } from '../sections'
import type { AdminLink } from '../sections'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'
import { getDeals, computeMetrics, countOpenTasks, formatMoney } from '@/lib/crm/pipeline'
import { getDensitySignal } from '@/lib/analytics/density'

// Growth — "grow it." The DOMAIN DASHBOARD (ADR-233 §3.2): the same tiled grammar as
// the exec home, scoped to funnels, onboarding, pipeline, campaigns, and the expansion
// signal. KPI MiniStat clusters + graphs + a domain attention strip + area-card entry
// tiles into the domain's surfaces. Headers + instructional copy on the canvas; all
// data in white tiles. Gate: host+ / marketing staff (each surface keeps its own gate).
// Every heavy aggregate sits behind its own Suspense so the shell never blocks
// (PAGE-FRAMEWORK §5).

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12

export default async function GrowthDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'marketing' })
  const links = groupLinks('growth', role, webRole, staffRole)
  const order = sanitizeDashOrder('growth', (await cookies()).get(dashCookie('growth'))?.value)

  const sections: Record<string, React.ReactNode> = {
    funnel: (
      <Suspense fallback={<DashSkeleton title="Funnel & activation" />}>
        <FunnelArea />
      </Suspense>
    ),
    pipeline: (
      <Suspense fallback={<DashSkeleton title="Pipeline" />}>
        <PipelineArea />
      </Suspense>
    ),
    expansion: (
      <Suspense fallback={<DashSkeleton title="Expansion" />}>
        <ExpansionArea />
      </Suspense>
    ),
    work: (
      <AdminSection title="Work in Growth" description="Every surface in this domain you can reach.">
        <AreaTiles links={links} />
      </AdminSection>
    ),
  }

  return (
    <AdminTemplate
      title="Growth"
      eyebrow="Domain"
      icon={TrendingUp}
      width="wide"
      description="Grow it. Funnels, onboarding, pipeline, campaigns, and the expansion signal. Start with whatever needs your attention, then dig into a surface."
    >
      {order.map((id) => (
        <Fragment key={id}>{sections[id]}</Fragment>
      ))}
    </AdminTemplate>
  )
}

// ── Funnel & activation — new joins trend + the activation funnel. ─────────────
async function FunnelArea() {
  const admin = createAdminClient()
  const now = new Date()
  const growthStart = new Date(now.getTime() - GROWTH_WEEKS * WEEK).toISOString()

  const [joinsRes, totalProfilesRes, practice, dash, campaignsCount, segmentsCount, sequencesCount, contactsCount] =
    await Promise.all([
      admin.from('profiles').select('created_at').gte('created_at', growthStart),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      getPracticeMetrics(),
      getEngagementDashboard(),
      admin.from('campaigns').select('id', { count: 'exact', head: true }),
      admin.from('segments').select('id', { count: 'exact', head: true }),
      admin.from('nurture_sequences').select('id', { count: 'exact', head: true }).eq('enabled', true),
      admin.from('contacts').select('id', { count: 'exact', head: true }),
    ])

  const totalProfiles = totalProfilesRes.count ?? 0
  const joinDates = (joinsRes.data ?? []).map((r) => new Date(r.created_at as string))
  const weeklyJoins = weeklyBuckets(joinDates, GROWTH_WEEKS, now)
  const joinedInWindow = weeklyJoins.reduce((a, b) => a + b, 0)
  const growthSeries = cumulative(totalProfiles - joinedInWindow, weeklyJoins)
  const newMembers30d = weeklyJoins.slice(-4).reduce((a, b) => a + b, 0)
  const activationPct = Math.round(practice.activationRate * 100)

  const steps = dash.activationFunnel
  const top = steps[0]?.actors ?? 0

  return (
    <DashArea
      icon={TrendingUp}
      label="Funnel & activation"
      blurb="New members joining, and how many reach the North-Star moment (a verified practice) within their first week. The funnel shows where it jams."
      href="/admin/insights?tab=engagement"
      hrefLabel="Open Engagement"
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <GraphTile
          label="Member growth"
          value={totalProfiles.toLocaleString()}
          caption={`${GROWTH_WEEKS} weeks${newMembers30d > 0 ? ` · +${newMembers30d} this month` : ''}`}
        >
          <TrendArea points={growthSeries} height={64} />
        </GraphTile>
        <div className="col-span-1 flex items-center rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <RingGauge
            pct={practice.activationRate}
            label="Activation · 7d"
            sub={`${practice.activated} of ${practice.newMembers} new activated`}
          />
        </div>
        <Tile label="Campaigns & audiences">
          <MiniGrid>
            <MiniStat value={(campaignsCount.count ?? 0).toLocaleString()} label="Campaigns" />
            <MiniStat value={(segmentsCount.count ?? 0).toLocaleString()} label="Segments" />
            <MiniStat value={(sequencesCount.count ?? 0).toLocaleString()} label="Active sequences" />
            <MiniStat value={(contactsCount.count ?? 0).toLocaleString()} label="Contacts" />
          </MiniGrid>
        </Tile>
        <Tile
          label="Activation funnel"
          span={3}
          caption="Last 30 days · distinct founders reaching each step, as a share of the first."
        >
          {steps.length === 0 ? (
            <p className="text-sm text-muted">No funnel signal yet.</p>
          ) : (
            <div className="space-y-2.5">
              {steps.map((s) => {
                const width = top > 0 ? Math.round((s.actors / top) * 100) : 0
                return (
                  <div key={s.step}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-text">{s.step}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {s.actors.toLocaleString()}
                        {s.dropPct !== null && s.dropPct > 0 && (
                          <span className="ml-1.5 text-2xs text-danger">−{s.dropPct}%</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-subtle">Activation is {activationPct}% over the last 7 days.</p>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── Pipeline (CRM) — deals by status, value, follow-ups, new-deal volume. ──────
async function PipelineArea() {
  const [deals, tasksDue] = await Promise.all([getDeals(), countOpenTasks()])
  const metrics = computeMetrics(deals, tasksDue)
  const dealSeries = weeklyBuckets(
    deals.map((d) => new Date(d.created_at)),
    8,
    new Date(),
  )

  // The domain attention spine — only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (metrics.tasksDue > 0) {
    attention.push({
      id: 'followups',
      severity: metrics.tasksDue > 5 ? 'risk' : 'watch',
      title: `${metrics.tasksDue} follow-up${metrics.tasksDue === 1 ? '' : 's'} due`,
      finding: 'Open CRM tasks waiting so deals do not stall.',
      action: { label: 'Open CRM', href: '/admin/crm' },
    })
  }

  return (
    <DashArea
      icon={TrendingUp}
      label="Pipeline"
      blurb="Open deals, their value, and the follow-ups due so nothing stalls."
      href="/admin/crm"
      hrefLabel="Open CRM"
    >
      <TileGrid>
        <Tile label="Pipeline">
          <MiniGrid>
            <MiniStat value={metrics.openCount.toLocaleString()} label="Open deals" />
            <MiniStat value={formatMoney(metrics.openValue)} label="Open value" />
            <MiniStat value={metrics.winRatePct === null ? '—' : `${metrics.winRatePct}%`} label="Win rate" />
            <MiniStat
              value={metrics.tasksDue.toLocaleString()}
              label="Follow-ups due"
              tone={metrics.tasksDue > 0 ? 'bad' : 'neutral'}
            />
          </MiniGrid>
        </Tile>
        <GraphTile
          label="New deals / wk"
          value={dealSeries.reduce((a, b) => a + b, 0).toLocaleString()}
          caption="8 weeks · current highlighted"
        >
          <WeekBars values={dealSeries} height={64} />
        </GraphTile>
        {attention.length > 0 && (
          <Tile label="Needs attention">
            <AttentionList items={attention} />
          </Tile>
        )}
      </TileGrid>
    </DashArea>
  )
}

// ── Expansion — density readiness for the next Lab. ───────────────────────────
async function ExpansionArea() {
  const density = await getDensitySignal()
  const topSignal = density.ready[0] ?? density.places[0]

  return (
    <DashArea
      icon={TrendingUp}
      label="Expansion"
      blurb="Where local member density is crossing the threshold that justifies opening the next Lab."
      href="/admin/insights?tab=expansion"
      hrefLabel="Open Expansion"
    >
      <TileGrid>
        <Tile label="Density signal">
          <MiniGrid>
            <MiniStat value={density.totals.cities.toLocaleString()} label="Cities tracked" />
            <MiniStat
              value={density.ready.length.toLocaleString()}
              label="Labs ready"
              tone={density.ready.length > 0 ? 'good' : 'neutral'}
            />
            <MiniStat value={density.totals.listings.toLocaleString()} label="Listings" />
            <MiniStat value={density.totals.residents.toLocaleString()} label="Residents" />
          </MiniGrid>
        </Tile>
        {topSignal && (
          <Tile label="Strongest signal">
            <p className="leading-none">
              <span className="text-[1.625rem] font-bold tabular-nums text-text">{Math.round(topSignal.score)}</span>
              <span className="text-sm text-subtle">/100</span>
            </p>
            <p className="mt-2 text-sm font-semibold text-text">{topSignal.city}</p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-subtle">{topSignal.stage} stage</p>
          </Tile>
        )}
      </TileGrid>
    </DashArea>
  )
}

// Area-card entry tiles into the domain's surfaces, grouped by the section each link
// declares (role filtering happens upstream in groupLinks).
function AreaTiles({ links }: { links: readonly AdminLink[] }) {
  const sections = new Map<string, AdminLink[]>()
  for (const l of links) {
    const key = l.section ?? 'More'
    const list = sections.get(key) ?? []
    list.push(l)
    sections.set(key, list)
  }
  return (
    <div className="space-y-6">
      {[...sections.entries()].map(([section, group]) => (
        <div key={section}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{section}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group flex items-start gap-3 rounded-2xl bg-surface-elevated/60 p-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
                  <l.Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-text">
                    {l.label}
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{l.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// On-canvas area skeleton matching the DashArea grammar — a canvas title + line, then
// a row of white tile placeholders. Mirrors the home + Programs dashboard fallbacks.
function DashSkeleton({ title }: { title: string }) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-0 sm:pt-9">
      <h2 className="text-xl font-bold tracking-tight text-text">{title}</h2>
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
      </div>
    </section>
  )
}
