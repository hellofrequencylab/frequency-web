import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { loadEventCoreStats } from '@/lib/events/event-stats'
import { EventCoreStatsCards } from '@/components/events/event-core-stats'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import {
  EngagementSection,
  RsvpBreakdownSection,
  RosterSection,
  ApprovalsSection,
  FollowUpSection,
  QuestionnaireSection,
  TicketTiersSection,
  DispatchesSection,
} from './sections'

// Host Manage Dashboard (EVENTS-REWORK A2). The metric-led operator surface for
// one event: the RSVP roster, the approval queue, the questionnaire (authoring +
// responses + CSV export), sent Event Dispatches, and headline analytics. Built on
// the Dashboard template; page-chrome registers this route with the global rail
// (railFor → 'global') so the "Edit details" button below can slide out the event
// settings editor in place. Gated to the host/cohost; anyone else gets a 404 (we
// never confirm a private event exists).
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

  // One cheap core-stats read drives the headline row (the same shared read + row the
  // settings rail uses); the heavier per-section reads stream behind Suspense below.
  const coreStats = await loadEventCoreStats(event.id)

  return (
    <DashboardTemplate
      eyebrow="Manage"
      title={event.title}
      description="Your behind-the-scenes view: who is coming, who is waiting, what they told you, and the updates you have sent."
      back={{ href: `/events/${event.slug}`, label: 'Back to event' }}
      width="default"
      actions={
        // Edit details opens the event settings editor as the in-place admin rail
        // slide-over (openAdminBar, pointed at this event scope) instead of navigating
        // away to /edit — the same trigger the entity "Edit" buttons use elsewhere.
        // The rail is present here because the Manage dashboard keeps the global rail
        // column (railFor → 'global'); the AdminBar listens for OPEN_ADMIN_BAR shell-wide.
        <OpenAdminBarButton
          scope={{ kind: 'event', id: event.slug }}
          caps={Array.from(caps)}
          label="Edit details"
          icon={<Pencil className="h-4 w-4" />}
        />
      }
      stats={<EventCoreStatsCards stats={coreStats} />}
    >
      <section>
        <SectionHeader title="Reach" />
        <Suspense fallback={<SectionFallback />}>
          <EngagementSection slug={event.slug} />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="RSVP status" />
        <Suspense fallback={<SectionFallback />}>
          <RsvpBreakdownSection eventId={event.id} />
        </Suspense>
      </section>

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
        <SectionHeader title="Follow up" />
        <Suspense fallback={<SectionFallback />}>
          <FollowUpSection eventId={event.id} />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="Questionnaire" />
        <Suspense fallback={<SectionFallback />}>
          <QuestionnaireSection eventId={event.id} slug={event.slug} eventTitle={event.title} />
        </Suspense>
      </section>

      {TICKETING_ENABLED && (
        <section>
          <SectionHeader title="Ticket tiers" />
          <Suspense fallback={<SectionFallback />}>
            <TicketTiersSection eventId={event.id} slug={event.slug} />
          </Suspense>
        </section>
      )}

      <section>
        <SectionHeader title="Sent Dispatches" />
        <Suspense fallback={<SectionFallback />}>
          <DispatchesSection eventId={event.id} />
        </Suspense>
      </section>
    </DashboardTemplate>
  )
}
