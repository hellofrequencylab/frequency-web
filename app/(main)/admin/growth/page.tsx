import { Suspense } from 'react'
import {
  UserPlus, TrendingUp, DollarSign, Radar, Contact, Users, Megaphone,
  PieChart, Layers, Filter, Building2, Map as MapIcon, ClipboardCheck,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { ChartCard, TrendArea, WeekBars, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'
import { getDeals, computeMetrics, countOpenTasks, formatMoney } from '@/lib/crm/pipeline'
import { getDensitySignal } from '@/lib/analytics/density'
import type { LucideIcon } from 'lucide-react'

// Growth — "grow it." The domain dashboard for funnels, onboarding, pipeline,
// campaigns, and the expansion signal. Rebuilt (mirrors the admin HOME redesign,
// ADR-228): a header KPI pulse on top, then sectioned operator panels. Gate stays
// host+ / marketing staff (sequences + insights areas keep their own page gates).
// Cheap counts run in one parallel sweep up top; every heavy aggregate
// (getPracticeMetrics, getEngagementDashboard, getDeals, getDensitySignal) sits
// behind its own <Suspense> so the shell never blocks (PAGE-FRAMEWORK §5).

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
      actions={
        <Suspense fallback={<HeaderKpis items={kpiLoading} />}>
          <HeaderKpiStrip
            newMembers30d={newMembers30d}
            contacts={contactsCount.count ?? 0}
            openDeals={openDealsCount.count ?? 0}
          />
        </Suspense>
      }
    >
      {/* ── Funnel & activation — new joins trend + the activation funnel. ── */}
      <AdminSection
        title="Funnel & activation"
        description="New members joining, and how many reach the North-Star moment (a verified practice) within their first week."
      >
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ChartCard
              title="Member growth"
              value={totalProfiles.toLocaleString()}
              delta={newMembers30d > 0 ? `+${newMembers30d} · 30d` : undefined}
              caption={`${GROWTH_WEEKS} weeks ago → now`}
            >
              <TrendArea points={growthSeries} />
            </ChartCard>
          </div>
          <div className="lg:col-span-4">
            <Suspense fallback={<ActivationCardSkeleton />}>
              <ActivationCard />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<FunnelSkeleton />}>
          <ActivationFunnel />
        </Suspense>
      </AdminSection>

      {/* ── Pipeline (CRM) — deals by status, value, follow-ups. ── */}
      <Suspense fallback={<SectionSkeleton title="Pipeline" cards={4} />}>
        <PipelineSection />
      </Suspense>

      {/* ── Campaigns & audiences — cheap counts from the up-top sweep. ── */}
      <AdminSection
        title="Campaigns & audiences"
        description="What's going out, who it reaches, and the nurture flows running on their own."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Campaigns" value={(campaignsCount.count ?? 0).toLocaleString()} icon={Megaphone} href="/admin/marketing" />
          <StatCard label="Segments" value={(segmentsCount.count ?? 0).toLocaleString()} icon={PieChart} href="/admin/segments" />
          <StatCard label="Active sequences" value={(sequencesCount.count ?? 0).toLocaleString()} icon={Layers} href="/pages/sequences" />
          <StatCard label="Contacts" value={(contactsCount.count ?? 0).toLocaleString()} icon={Contact} href="/connections" />
        </div>
      </AdminSection>

      {/* ── Expansion — density readiness for the next Lab. ── */}
      <Suspense fallback={<SectionSkeleton title="Expansion" cards={4} />}>
        <ExpansionSection />
      </Suspense>
    </AdminPage>
  )
}

// ── Header KPI strip — the soft pulse in the page-header actions slot. ─────────
// (Copied inline from the admin HOME dashboard's HeaderKpis, per the redesign.)
function HeaderKpis({ items }: { items: { label: string; value: React.ReactNode; icon: LucideIcon }[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-0.5 rounded-2xl bg-surface-elevated/70 p-1">
      {items.map((k) => (
        <div key={k.label} className="min-w-[5.5rem] rounded-xl px-3.5 py-2">
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <k.icon className="h-3 w-3 shrink-0" aria-hidden />
            {k.label}
          </span>
          <span className="mt-0.5 block text-xl font-extrabold leading-none tabular-nums text-text">
            {k.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const kpiLoading: { label: string; value: React.ReactNode; icon: LucideIcon }[] = [
  { label: 'New · 30d', value: '…', icon: UserPlus },
  { label: 'Activation · 7d', value: '…', icon: TrendingUp },
  { label: 'Contacts', value: '…', icon: Contact },
  { label: 'Open deals', value: '…', icon: DollarSign },
]

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
    <HeaderKpis
      items={[
        { label: 'New · 30d', value: newMembers30d.toLocaleString(), icon: UserPlus },
        { label: 'Activation · 7d', value: `${Math.round(m.activationRate * 100)}%`, icon: TrendingUp },
        { label: 'Contacts', value: contacts.toLocaleString(), icon: Contact },
        { label: 'Open deals', value: openDeals.toLocaleString(), icon: DollarSign },
      ]}
    />
  )
}

// ── Activation card — the 7-day activation ratio, beside the growth trend. ────
async function ActivationCard() {
  const m = await getPracticeMetrics()
  return (
    <div className="flex h-full flex-col justify-center rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Activation · 7d</p>
      <p className="mt-1 text-3xl font-extrabold leading-none tabular-nums text-text">
        {Math.round(m.activationRate * 100)}%
      </p>
      <p className="mt-1.5 text-sm text-muted">
        {m.activated.toLocaleString()} of {m.newMembers.toLocaleString()} new members reached a verified practice.
      </p>
    </div>
  )
}

function ActivationCardSkeleton() {
  return <div className="h-full min-h-[7rem] animate-pulse rounded-2xl bg-surface-elevated/60" />
}

// ── Activation funnel — induction → Vera → circle → adopt → verify. ───────────
async function ActivationFunnel() {
  const dash = await getEngagementDashboard()
  const steps = dash.activationFunnel
  const top = steps[0]?.actors ?? 0
  return (
    <ChartCard title="Activation funnel" caption="New-member journey · last 30 days · share of the first step">
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
    </ChartCard>
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
    <AdminSection
      title="Pipeline"
      description="Open deals, their value, and the follow-ups due so nothing stalls."
    >
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-8">
          <StatCard label="Open deals" value={metrics.openCount.toLocaleString()} icon={ClipboardCheck} href="/admin/crm" />
          <StatCard label="Open value" value={formatMoney(metrics.openValue)} icon={DollarSign} href="/admin/crm" />
          <StatCard
            label="Win rate"
            value={metrics.winRatePct === null ? '—' : `${metrics.winRatePct}%`}
            icon={TrendingUp}
            href="/admin/crm"
          />
          <StatCard
            label="Follow-ups due"
            value={metrics.tasksDue.toLocaleString()}
            icon={Filter}
            href="/admin/crm"
            delta={metrics.tasksDue > 0 ? { label: 'open tasks', trend: 'flat' } : undefined}
          />
        </div>
        <div className="lg:col-span-4">
          <ChartCard title="New deals / week" caption="8 weeks · current week highlighted">
            <WeekBars values={dealSeries} />
          </ChartCard>
        </div>
      </div>
    </AdminSection>
  )
}

// ── Expansion — where member density justifies the next Lab. ──────────────────
async function ExpansionSection() {
  const density = await getDensitySignal()
  const top = density.ready[0] ?? density.places[0]

  return (
    <AdminSection
      title="Expansion"
      description="Where local member density is crossing the threshold that justifies opening the next Lab."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Cities tracked" value={density.totals.cities.toLocaleString()} icon={MapIcon} href="/admin/expansion" />
        <StatCard label="Labs ready" value={density.ready.length.toLocaleString()} icon={Radar} href="/admin/expansion" />
        <StatCard label="Listings" value={density.totals.listings.toLocaleString()} icon={Building2} href="/admin/expansion" />
        <StatCard label="Residents" value={density.totals.residents.toLocaleString()} icon={Users} href="/admin/expansion" />
      </div>
      {top && (
        <p className="text-sm text-muted">
          Strongest signal:{' '}
          <span className="font-semibold text-text">{top.city}</span> · readiness{' '}
          {Math.round(top.score)}/100 ({top.stage})
        </p>
      )}
    </AdminSection>
  )
}

// ── Suspense fallbacks ────────────────────────────────────────────────────────
function SectionSkeleton({ title, cards }: { title: string; cards: number }) {
  return (
    <AdminSection title={title}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-elevated/60" />
        ))}
      </div>
    </AdminSection>
  )
}

function FunnelSkeleton() {
  return <div className="h-44 animate-pulse rounded-2xl bg-surface-elevated/60" />
}
