import { Suspense } from 'react'
import { Users, CircleDot, CalendarDays, ShieldAlert, LifeBuoy, SlidersHorizontal } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { groupSections } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'

// Operations — "run the site." The domain dashboard for community, people, trust &
// safety, and the platform keys. Gate: host+ floor; individual areas keep their own
// (often janitor) gates. KPIs on top; areas of focus grouped under titled sections
// (Community / People / Trust & safety / Site & system). Slow stats sit behind their
// own Suspense so the shell never blocks (PAGE-FRAMEWORK §5).

export default async function OperationsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })
  const sections = groupSections('operations', role, webRole, staffRole)

  return (
    <AdminPage
      title="Operations"
      eyebrow="Domain"
      icon={SlidersHorizontal}
      description="Run the site. Community, people, trust and safety, and the platform keys."
    >
      <AdminSection title="At a glance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Suspense fallback={<StatCard label="Members" value="…" icon={Users} />}>
            <MembersStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Active circles" value="…" icon={CircleDot} />}>
            <CirclesStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Upcoming events" value="…" icon={CalendarDays} />}>
            <EventsStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Open reports" value="…" icon={ShieldAlert} />}>
            <ReportsStat />
          </Suspense>
          <Suspense fallback={<StatCard label="Open tickets" value="…" icon={LifeBuoy} />}>
            <TicketsStat />
          </Suspense>
        </div>
      </AdminSection>

      <AdminSection title="Areas of focus" description="Everything in Operations you can manage.">
        <AdminAreaSections sections={sections} />
      </AdminSection>
    </AdminPage>
  )
}

async function MembersStat() {
  const admin = createAdminClient()
  const { count } = await admin
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  return <StatCard label="Members" value={(count ?? 0).toLocaleString()} icon={Users} href="/admin/members" />
}

async function CirclesStat() {
  const admin = createAdminClient()
  const { count } = await admin
    .from('circles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  return <StatCard label="Active circles" value={(count ?? 0).toLocaleString()} icon={CircleDot} href="/admin/circles" />
}

async function EventsStat() {
  const admin = createAdminClient()
  const { count } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .gte('starts_at', new Date().toISOString())
    .eq('is_cancelled', false)
  return <StatCard label="Upcoming events" value={(count ?? 0).toLocaleString()} icon={CalendarDays} href="/admin/events" />
}

async function ReportsStat() {
  const admin = createAdminClient()
  const { count } = await admin
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  return <StatCard label="Open reports" value={(count ?? 0).toLocaleString()} icon={ShieldAlert} href="/admin/moderation" />
}

async function TicketsStat() {
  const counts = await ticketStatusCounts()
  const open = Object.entries(counts).reduce(
    (sum, [status, n]) => (isOpenStatus(status as never) ? sum + n : sum),
    0,
  )
  return <StatCard label="Open tickets" value={open.toLocaleString()} icon={LifeBuoy} href="/admin/support" />
}
