import { Suspense } from 'react'
import { TrendingUp } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage } from '@/components/admin/admin-page'
import { DashSection, StatRow, StatItem } from '@/components/admin/dash'
import { TrendArea, WeekBars, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'
import { getDeals, computeMetrics, countOpenTasks, formatMoney } from '@/lib/crm/pipeline'
import { getDensitySignal } from '@/lib/analytics/density'

// Growth — "grow it." The domain dashboard for funnels, onboarding, pipeline,
// campaigns, and the expansion signal. Restyled onto the admin HOME card grammar
// (ADR-228): a header KPI strip on top, then one WHITE DashSection card per
// section with value-first StatRows, and inline PulseBlock plots (no nested
// ChartCard borders). Gate stays host+ / marketing staff (sequences + insights
// areas keep their own page gates). Cheap counts run in one parallel sweep up
// top; every heavy aggregate (getPracticeMetrics, getEngagementDashboard,
// getDeals, getDensitySignal) sits behind its own <Suspense> so the shell never
// blocks (PAGE-FRAMEWORK §5).

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12

export default async function GrowthDashboard() {
  await requireAdmin('host', { staff: 'marketing' })

  const admin = createAdminClient()
  const now = new Date()
  const growthStart = new Date(now.getTime() - GROWTH_WEEKS * WEEK).toISOString()

  // One cheap parallel sweep: header-strip counts + the new-member growth series.
  // (Heavier analytics RPCs/aggregates render behind Suspense below.)
  const [
    joinsRes,
    totalProfilesRes,
    contactsCount,
    openDealsCount,
    campaignsCount,
    segmentsCount,
    sequencesCount,
  ] = await Promise.all([
    admin.from('profiles').select('created_at').gte('created_at', growthStart),
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('contacts').select('id', { count: 'exact', head: true }),
    admin.from('crm_deals').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('campaigns').select('id', { count: 'exact', head: true }),
    admin.from('segments').select('id', { count: 'exact', head: true }),
    admin.from('nurture_sequences').select('id', { count: 'exact', head: true }).eq('enabled', true),
  ])

  const totalProfiles = totalProfilesRes.count ?? 0
  const joinDates = (joinsRes.data ?? []).map((r) => new Date(r.created_at as string))
  const weeklyJoins = weeklyBuckets(joinDates, GROWTH_WEEKS, now)
  const joinedInWindow = weeklyJoins.reduce((a, b) => a + b, 0)
  const growthSeries = cumulative(totalProfiles - joinedInWindow, weeklyJoins)
  const newMembers30d = weeklyJoins.slice(-4).reduce((a, b) => a + b, 0)

  return (
    <AdminPage
      title="Growth"
      eyebrow="Domain"
      icon={TrendingUp}
      width="wide"
      description="Grow it. Funnels, onboarding, pipeline, campaigns, and the expansion signal."
      // The header owns the live numbers (F-pattern: most important, top right of
      // the title) — one white strip, value-first. Activation needs the heavier
      // practice read, so the strip sits behind its own Suspense.
      actions={
        <Suspense fallback={<HeaderKpiStripSkeleton />}>
          <HeaderKpiStrip
            newMembers30d={newMembers30d}
            contacts={contactsCount.count ?? 0}
            openDeals={openDealsCount.count ?? 0}
          />
        </Suspense>
      }
    >
      {/* ── Funnel & activation — new joins trend + the activation funnel. ── */}
      <DashSection
        title="Funnel & activation"
        description="New members joining, and how many reach the North-Star moment (a verified practice) within their first week."
        href="/admin/engagement"
        hrefLabel="Engagement"
      >
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <PulseBlock
            label="Member growth"
            value={totalProfiles.toLocaleString()}
            delta={newMembers30d > 0 ? `+${newMembers30d} this month` : undefined}
            caption={`${GROWTH_WEEKS} weeks ago → now`}
          >
            <TrendArea points={growthSeries} height={44} />
          </PulseBlock>
          <Suspense fallback={<ActivationStatSkeleton />}>
            <ActivationStat />
          </Suspense>
        </div>
        <Suspense fallback={<FunnelSkeleton />}>
          <ActivationFunnel />
        </Suspense>
      </DashSection>

      {/* ── Pipeline (CRM) — deals by status, value, follow-ups. ── */}
      <Suspense fallback={<DashSkeleton title="Pipeline" />}>
        <PipelineSection />
      </Suspense>

      {/* ── Campaigns & audiences — cheap counts from the up-top sweep. ── */}
      <DashSection
        title="Campaigns & audiences"
        description="What's going out, who it reaches, and the nurture flows running on their own."
      >
        <StatRow>
          <StatItem value={(campaignsCount.count ?? 0).toLocaleString()} label="Campaigns" href="/admin/marketing" />
          <StatItem value={(segmentsCount.count ?? 0).toLocaleString()} label="Segments" href="/admin/segments" />
          <StatItem value={(sequencesCount.count ?? 0).toLocaleString()} label="Active sequences" href="/pages/sequences" />
          <StatItem value={(contactsCount.count ?? 0).toLocaleString()} label="Contacts" href="/connections" />
        </StatRow>
      </DashSection>

      {/* ── Expansion — density readiness for the next Lab. ── */}
      <Suspense fallback={<DashSkeleton title="Expansion" />}>
        <ExpansionSection />
      </Suspense>
    </AdminPage>
  )
}

// ── Header KPI strip — the live numbers in the page-header actions slot. ───────
// (Copied from the admin HOME dashboard: one bordered white strip, value-first.)
function HeaderKpiStripFrame({
  items,
}: {
  items: { label: string; value: React.ReactNode }[]
}) {
  return (
    <div className="flex divide-x divide-border/60 rounded-2xl border border-border bg-surface px-1 py-2.5 shadow-sm">
      {items.map((k) => (
        <div key={k.label} className="px-4">
          <p className="text-xl font-extrabold leading-none tabular-nums text-text">{k.value}</p>
          <p className="mt-1 whitespace-nowrap text-xs font-medium text-muted">{k.label}</p>
        </div>
      ))}
    </div>
  )
}

function HeaderKpiStripSkeleton() {
  return (
    <HeaderKpiStripFrame
      items={[
        { label: 'New · 30d', value: '…' },
        { label: 'Activation · 7d', value: '…' },
        { label: 'Contacts', value: '…' },
        { label: 'Open deals', value: '…' },
      ]}
    />
  )
}

// Activation rate is the only KPI that needs the (heavier) practice read, so the
// strip awaits getPracticeMetrics() and renders all four numbers together.
async function HeaderKpiStrip({
  newMembers30d,
  contacts,
  openDeals,
}: {
  newMembers30d: number
  contacts: number
  openDeals: number
}) {
  const m = await getPracticeMetrics()
  return (
    <HeaderKpiStripFrame
      items={[
        { label: 'New · 30d', value: newMembers30d.toLocaleString() },
        { label: 'Activation · 7d', value: `${Math.round(m.activationRate * 100)}%` },
        { label: 'Contacts', value: contacts.toLocaleString() },
        { label: 'Open deals', value: openDeals.toLocaleString() },
      ]}
    />
  )
}

// One plot inside a DashSection — label, headline value, compact plot, caption.
// No inner border: the SECTION is the card; blocks inside divide by whitespace.
// (Copied from the admin HOME dashboard's PulseBlock.)
function PulseBlock({
  label,
  value,
  delta,
  caption,
  children,
}: {
  label: string
  value: React.ReactNode
  delta?: string
  caption?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-extrabold leading-none tabular-nums text-text">{value}</p>
        {delta && <p className="text-2xs font-semibold text-success">{delta}</p>}
      </div>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
      <div className="mt-2 h-11">{children}</div>
      {caption && <p className="mt-1 text-2xs text-subtle">{caption}</p>}
    </div>
  )
}

// ── Activation stat — the 7-day activation ratio, beside the growth trend. ────
async function ActivationStat() {
  const m = await getPracticeMetrics()
  return (
    <div className="flex flex-col justify-center">
      <p className="text-2xl font-extrabold leading-none tabular-nums text-text">
        {Math.round(m.activationRate * 100)}%
      </p>
      <p className="mt-1 text-xs font-medium text-muted">Activation · 7d</p>
      <p className="mt-1.5 text-sm leading-snug text-muted">
        {m.activated.toLocaleString()} of {m.newMembers.toLocaleString()} new members reached a verified practice.
      </p>
    </div>
  )
}

function ActivationStatSkeleton() {
  return <div className="min-h-[5rem] animate-pulse rounded-xl bg-surface-elevated/60" />
}

// ── Activation funnel — induction → Vera → circle → adopt → verify. ───────────
// Stays a compact list inside the section card.
async function ActivationFunnel() {
  const dash = await getEngagementDashboard()
  const steps = dash.activationFunnel
  const top = steps[0]?.actors ?? 0
  return (
    <div className="mt-5 border-t border-border/60 pt-4">
      <p className="mb-2 text-xs font-semibold text-text">
        Activation funnel{' '}
        <span className="font-normal text-subtle">· last 30 days · share of the first step</span>
      </p>
      <div className="space-y-2 py-1">
        {steps.map((s) => {
          const pct = top > 0 ? Math.round((s.actors / top) * 100) : 0
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
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Pipeline (CRM) — deals/value/win-rate/follow-ups + new-deal volume. ───────
async function PipelineSection() {
  const [deals, tasksDue] = await Promise.all([getDeals(), countOpenTasks()])
  const metrics = computeMetrics(deals, tasksDue)

  // New deals per week (8-week volume bars) from the deals we already fetched.
  const dealSeries = weeklyBuckets(
    deals.map((d) => new Date(d.created_at)),
    8,
    new Date(),
  )

  return (
    <DashSection
      title="Pipeline"
      description="Open deals, their value, and the follow-ups due so nothing stalls."
      href="/admin/crm"
      hrefLabel="CRM"
    >
      <StatRow>
        <StatItem value={metrics.openCount.toLocaleString()} label="Open deals" href="/admin/crm" />
        <StatItem value={formatMoney(metrics.openValue)} label="Open value" href="/admin/crm" />
        <StatItem
          value={metrics.winRatePct === null ? '—' : `${metrics.winRatePct}%`}
          label="Win rate"
          href="/admin/crm"
        />
        <StatItem
          value={metrics.tasksDue.toLocaleString()}
          label="Follow-ups due"
          delta={metrics.tasksDue > 0 ? 'open tasks' : undefined}
          deltaTone={metrics.tasksDue > 0 ? 'bad' : 'neutral'}
          href="/admin/crm"
        />
      </StatRow>
      <div className="mt-5 border-t border-border/60 pt-4 sm:max-w-sm">
        <PulseBlock
          label="New deals / week"
          value={dealSeries.reduce((a, b) => a + b, 0)}
          caption="8 weeks · current week highlighted"
        >
          <WeekBars values={dealSeries} height={44} />
        </PulseBlock>
      </div>
    </DashSection>
  )
}

// ── Expansion — where member density justifies the next Lab. ──────────────────
async function ExpansionSection() {
  const density = await getDensitySignal()
  const top = density.ready[0] ?? density.places[0]

  return (
    <DashSection
      title="Expansion"
      description="Where local member density is crossing the threshold that justifies opening the next Lab."
      href="/admin/expansion"
      hrefLabel="Expansion"
    >
      <StatRow>
        <StatItem value={density.totals.cities.toLocaleString()} label="Cities tracked" href="/admin/expansion" />
        <StatItem
          value={density.ready.length.toLocaleString()}
          label="Labs ready"
          deltaTone={density.ready.length > 0 ? 'good' : 'neutral'}
          delta={density.ready.length > 0 ? 'over threshold' : undefined}
          href="/admin/expansion"
        />
        <StatItem value={density.totals.listings.toLocaleString()} label="Listings" href="/admin/expansion" />
        <StatItem value={density.totals.residents.toLocaleString()} label="Residents" href="/admin/expansion" />
      </StatRow>
      {top && (
        <p className="mt-4 border-t border-border/60 pt-3 text-sm text-muted">
          Strongest signal: <span className="font-semibold text-text">{top.city}</span> · readiness{' '}
          {Math.round(top.score)}/100 ({top.stage})
        </p>
      )}
    </DashSection>
  )
}

// ── Suspense fallbacks — white section cards with pulsing content. ────────────
// (Mirrors the admin HOME dashboard's DashSkeleton.)
function DashSkeleton({ title }: { title: string }) {
  return (
    <DashSection title={title}>
      <div className="space-y-2.5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-elevated" />
        <div className="h-10 animate-pulse rounded-xl bg-surface-elevated/70" />
      </div>
    </DashSection>
  )
}

function FunnelSkeleton() {
  return <div className="mt-5 h-44 animate-pulse rounded-xl bg-surface-elevated/60" />
}
