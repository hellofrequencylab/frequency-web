import { Suspense } from 'react'
import { UserPlus, TrendingUp, Zap, DollarSign, Radar } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { AdminAreaGrid } from '@/components/admin/admin-area-grid'
import { groupLinks } from '../sections'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getDeals, computeMetrics, countOpenTasks, formatMoney } from '@/lib/crm/pipeline'
import { getDensitySignal } from '@/lib/analytics/density'

// Growth — "grow it." The domain dashboard for funnels, onboarding, pipeline,
// campaigns, and the expansion signal. Gate: host+ / marketing staff; sequences and
// the insights areas keep their own (janitor) gates at their pages. KPIs on top,
// areas of focus underneath. Each slow stat sits behind its own Suspense so the
// shell never blocks (PAGE-FRAMEWORK §5).

export default async function GrowthDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'marketing' })
  const links = groupLinks('growth', role, webRole, staffRole)

  return (
    <AdminPage
      title="Growth"
      eyebrow="Domain"
      icon={TrendingUp}
      description="Grow it. Funnels, onboarding, pipeline, campaigns, and the expansion signal."
    >
      <AdminSection title="At a glance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Suspense fallback={<StatCard label="New members (30d)" value="…" icon={UserPlus} />}>
            <AcquisitionStats />
          </Suspense>
          <Suspense fallback={<StatCard label="Pipeline value" value="…" icon={DollarSign} />}>
            <PipelineStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Ready cities" value="…" icon={Radar} />}>
            <ExpansionStat />
          </Suspense>
        </div>
      </AdminSection>

      <AdminSection title="Areas of focus" description="Everything in Growth you can manage.">
        <AdminAreaGrid links={links} />
      </AdminSection>
    </AdminPage>
  )
}

// New members, activation, and WAM all come from one read — render the three tiles
// together so we hit getPracticeMetrics() once.
async function AcquisitionStats() {
  const m = await getPracticeMetrics()
  return (
    <>
      <StatCard label="New members (30d)" value={m.newMembers.toLocaleString()} icon={UserPlus} />
      <StatCard
        label={`Activation (${m.activated}/${m.newMembers})`}
        value={`${Math.round(m.activationRate * 100)}%`}
        icon={TrendingUp}
      />
      <StatCard label="Weekly active members" value={m.wam.toLocaleString()} icon={Zap} href="/admin/engagement" />
    </>
  )
}

async function PipelineStat() {
  const [deals, tasksDue] = await Promise.all([getDeals(), countOpenTasks()])
  const metrics = computeMetrics(deals, tasksDue)
  return (
    <StatCard
      label="Pipeline value"
      value={formatMoney(metrics.openValue)}
      icon={DollarSign}
      delta={{ label: `${metrics.openCount} open`, trend: 'flat' }}
      href="/crm"
    />
  )
}

async function ExpansionStat() {
  const signal = await getDensitySignal()
  return (
    <StatCard
      label="Ready cities"
      value={signal.ready.length.toLocaleString()}
      icon={Radar}
      delta={{ label: `${signal.totals.cities} tracked`, trend: 'flat' }}
      href="/admin/expansion"
    />
  )
}
