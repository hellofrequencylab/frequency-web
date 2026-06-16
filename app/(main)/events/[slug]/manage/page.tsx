import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Users, Check, Star, Gauge, Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { loadRoster, loadAnalytics } from './load'
import {
  RosterSection,
  ApprovalsSection,
  QuestionnaireSection,
  DispatchesSection,
} from './sections'

// Host Manage Dashboard (EVENTS-REWORK A2). The metric-led operator surface for
// one event: the RSVP roster, the approval queue, the questionnaire (authoring +
// responses + CSV export), sent Event Dispatches, and headline analytics. Built on
// the Dashboard template (page-chrome registers it as Focus → no rail). Gated to
// the host/cohost; anyone else gets a 404 (we never confirm a private event exists).
//
// Speed is structural (PAGE-FRAMEWORK §5): the page resolves only the cheap roster
// for the StatCard row, then streams each heavy section behind its own <Suspense>.

export const metadata = {
  title: 'Manage event',
}

function SectionFallback() {
  return <Skeleton className="h-40 rounded-2xl" />
}

export default async function ManageEventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: ev } = await admin
    .from('events')
    .select('id, title, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!ev) notFound()

  const event = ev as { id: string; title: string; slug: string }

  // Gate: only the host, a cohost, or someone who runs the event's circle (the
  // 'event.editSettings' capability) may manage it. 404 (not 403) so a private
  // event slug never leaks via this route.
  const caps = await getEventCapabilities(event.id)
  if (!caps.has('event.editSettings')) notFound()

  // Cheap roster read drives the analytics StatCards; the heavier per-section reads
  // stream behind Suspense below.
  const roster = await loadRoster(event.id)
  const analytics = await loadAnalytics(event.id, roster)

  const capacityValue =
    analytics.capacity.capacity == null ? 'Unlimited' : String(analytics.capacity.capacity)
  const utilizationLabel =
    analytics.utilization == null ? '—' : `${analytics.utilization}%`

  return (
    <DashboardTemplate
      eyebrow="Manage"
      title={event.title}
      description="Your behind-the-scenes view: who is coming, who is waiting, what they told you, and the updates you have sent."
      back={{ href: `/events/${event.slug}`, label: 'Back to event' }}
      width="default"
      actions={
        <Link
          href={`/events/${event.slug}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          <Pencil className="h-4 w-4" /> Edit details
        </Link>
      }
      stats={
        <>
          <StatCard
            label="Going"
            value={analytics.going}
            icon={Check}
            detail={
              analytics.checkedIn > 0
                ? `${analytics.checkedIn} checked in`
                : analytics.headcount > analytics.going
                  ? `${analytics.headcount} with guests`
                  : undefined
            }
          />
          <StatCard label="Interested" value={analytics.maybe} icon={Star} />
          <StatCard
            label="Waitlist"
            value={analytics.waitlist}
            icon={Users}
            detail={analytics.waitlist > 0 ? 'waiting for a spot' : undefined}
          />
          <StatCard
            label="Capacity filled"
            value={utilizationLabel}
            icon={Gauge}
            detail={`${analytics.capacity.going} of ${capacityValue}`}
          />
        </>
      }
    >
      <section>
        <SectionHeader title="Roster" />
        <Suspense fallback={<SectionFallback />}>
          <RosterSection eventId={event.id} />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="Approval queue" />
        <Suspense fallback={<SectionFallback />}>
          <ApprovalsSection eventId={event.id} slug={event.slug} />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="Questionnaire" />
        <Suspense fallback={<SectionFallback />}>
          <QuestionnaireSection eventId={event.id} slug={event.slug} eventTitle={event.title} />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="Sent Dispatches" />
        <Suspense fallback={<SectionFallback />}>
          <DispatchesSection eventId={event.id} />
        </Suspense>
      </section>
    </DashboardTemplate>
  )
}
