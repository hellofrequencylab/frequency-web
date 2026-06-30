// Growth OS · Engine 3 — the application review queue (GE3-4, ADR-456). The
// operator's cockpit for the dual-track top of funnel: every application by track +
// status, one tap into a detail console to accept (grant host + hand off a Starter
// Circle) or decline, plus the seeker waitlist at a glance. Composes the kit:
// AdminTemplate (Dashboard sibling), StatCard KPIs, AdminSection groups, EmptyState.
//
// Gate: a staff web_role OR the members capability (write), re-checked here AND in
// every action (the admin client bypasses RLS, so the action is the authority).

import { Users, Inbox, CheckCircle2, Clock, ListChecks } from 'lucide-react'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAdmin } from '@/lib/admin/guard'
import {
  listApplications,
  applicationCounts,
  applicantNames,
  listWaitlist,
  waitlistCounts,
  type ListApplicationsFilter,
} from '@/lib/applications/store'
import { asTrack, asStatus, APPLICATION_TRACK_DEFS } from '@/lib/applications/tracks'
import { QueueClient } from './queue-client'

export const dynamic = 'force-dynamic'

export default async function ApplicationsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string; status?: string }>
}) {
  await requireAdmin('admin', { staff: 'members' })
  const sp = await searchParams

  const filter: ListApplicationsFilter = {
    track: asTrack(sp.track) ?? undefined,
    status: asStatus(sp.status) ?? undefined,
    openOnly: !sp.status, // default to the open queue when no explicit status
  }

  const [apps, waitlist] = await Promise.all([listApplications(filter), listWaitlist({ track: 'seeker' })])
  // Counts read the WHOLE queue (not the filtered view) so the KPIs are stable.
  const allApps = filter.track || filter.status ? await listApplications({}) : apps
  const counts = await applicationCounts(allApps)
  const wlCounts = await waitlistCounts(waitlist)

  const names = await applicantNames(apps.map((a) => a.applicantProfileId ?? '').filter(Boolean))

  const rows = apps.map((a) => {
    const resolved = a.applicantProfileId ? names.get(a.applicantProfileId) : undefined
    return {
      id: a.id,
      track: a.track,
      trackLabel: APPLICATION_TRACK_DEFS[a.track].label,
      status: a.status,
      applicant: a.applicantName || resolved?.displayName || a.applicantEmail || 'Someone',
      handle: resolved?.handle ?? null,
      createdAt: a.createdAt,
    }
  })

  return (
    <AdminTemplate
      eyebrow="Acquisition"
      title="Applications"
      icon={Users}
      width="wide"
      description="The dual-track top of funnel: builders apply to host, operators apply to bring an offering, and seekers wait for a Circle near them. Accept a host and we grant the role and hand them a Starter Circle."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="New" value={counts.pending} icon={Inbox} />
        <StatCard label="In review" value={counts.inReview} icon={Clock} />
        <StatCard label="Accepted" value={counts.accepted} icon={CheckCircle2} />
        <StatCard label="All applications" value={counts.total} icon={ListChecks} />
        <StatCard label="Waitlist" value={wlCounts.waiting} icon={Users} detail="seekers waiting" />
      </div>

      <AdminSection
        title="Review queue"
        description="Filter by track or status. Open one to read the answers and decide. Accepting a host grants the role and hands off a Starter Circle."
      >
        {rows.length === 0 ? (
          <EmptyState
            variant="cleared"
            title="Nothing in this view."
            description="No applications match the current filter. Clear it to see the rest, or check back as people apply."
          />
        ) : (
          <QueueClient
            rows={rows}
            activeTrack={filter.track ?? null}
            activeStatus={sp.status ?? null}
          />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
