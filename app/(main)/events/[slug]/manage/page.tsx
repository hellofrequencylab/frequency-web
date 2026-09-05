import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { DashboardTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import { EVENT_HUB_SECTIONS, asEventHubSection, type EventHubSection } from './hub'
import { EventMemberViewer } from './event-member-viewer'
import { EventBroadcastSection } from './broadcast-section'
import { RefundsOwedNotice } from './refunds-owed'
import {
  HomeStatsStrip,
  RsvpBreakdownSection,
  RosterSection,
  InvitedGuestsSection,
  ApprovalsSection,
  FollowUpSection,
  QuestionnaireSection,
  TicketTiersSection,
  DispatchesSection,
} from './sections'

// The event MANAGE HUB (Events manage overhaul; formerly the flat Host Manage Dashboard,
// EVENTS-REWORK A2). ONE master dashboard for an event, restructured on the Space /manage
// model (space-hub.ts): a pill sub-menu navigates the areas via `?section=` (server-rendered,
// shareable), and the old standalone Message Attendees page is folded in — the message center
// leads the Home tab, right under a compact stat strip (owner directive: messaging up front,
// smaller stat boxes). /manage/crm now redirects here. Still the bespoke event dashboard the
// menu contract carves out (MENU-CONTRACT.md): the hub sections are a route-local grouping,
// not a module catalog.
//
//   Home      → the at-a-glance strip (core stats + page views, compact tiles) + the message
//               center (the shared LeaderCrmViewer over the going/maybe roster).
//   Guests    → RSVP status, the roster, captured guests, the approval queue, follow-ups.
//   Questions → questionnaire authoring + responses + CSV export.
//   Tickets   → named ticket tiers (only while ticketing is enabled).
//   Updates   → sent Event Dispatches.
//   Settings  → the full in-place event editor (the SAME event.settings module the admin rail
//               mounts — the catalog module, not a parallel form).
//
// Gated to the host/cohost; anyone else gets a 404 (we never confirm a private event exists).
// Speed is structural (PAGE-FRAMEWORK §5): the shell + nav paint immediately; every section
// streams behind its own <Suspense>.

export const metadata = {
  title: 'Manage event',
}

function SectionFallback() {
  return <Skeleton className="h-40 rounded-2xl" />
}

/** The pill sub-menu (the Space HubNav pattern, same classes): one tab per manage area. */
function EventHubNav({ slug, section }: { slug: string; section: EventHubSection }) {
  const sections = EVENT_HUB_SECTIONS.filter((s) => s.key !== 'tickets' || TICKETING_ENABLED)
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Manage areas">
      {sections.map((s) => {
        const on = s.key === section
        return (
          <Link
            key={s.key}
            href={`/events/${slug}/manage?section=${s.key}`}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={
              'rounded-pill px-3 py-1.5 text-body-sm font-medium transition-colors ' +
              (on
                ? 'bg-primary text-on-primary'
                : 'border border-border text-muted hover:bg-surface-elevated hover:text-text')
            }
          >
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default async function ManageEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ section?: string }>
}) {
  const { slug } = await params
  const { section: rawSection } = await searchParams
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

  let section = asEventHubSection(rawSection)
  if (section === 'tickets' && !TICKETING_ENABLED) section = 'home'
  const blurb = EVENT_HUB_SECTIONS.find((s) => s.key === section)?.blurb

  return (
    <DashboardTemplate
      eyebrow="Manage event"
      title={event.title}
      description="Your behind-the-scenes view: who is coming, what they told you, and a direct line to reach them."
      back={{ href: `/events/${event.slug}`, label: 'Back to event' }}
      width="default"
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link href={`/events/${event.slug}/manage?section=settings`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit details
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <EventHubNav slug={event.slug} section={section} />
        {blurb && section !== 'home' && <p className="max-w-2xl text-body-sm text-muted">{blurb}</p>}
      </div>

      {section === 'home' && (
        <>
          {/* Refunds still owed on a cancelled event (scan2 L6-04). Nothing for a live event. */}
          <Suspense fallback={null}>
            <RefundsOwedNotice eventId={event.id} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-20 rounded-xl" />}>
            <HomeStatsStrip eventId={event.id} slug={event.slug} />
          </Suspense>
          <section>
            {/* The multi-channel broadcast composer (ADR-827 ruling 3): one message to the
                whole event audience over Email / Direct Message / Dispatch, Text coming
                soon. Streams behind its own Suspense (it loads the audience counts). */}
            <SectionHeader title="Message everyone" />
            <Suspense fallback={<Skeleton className="h-56 rounded-2xl" />}>
              <EventBroadcastSection eventId={event.id} slug={event.slug} />
            </Suspense>
          </section>
          <section>
            <SectionHeader title="Message center" />
            <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
              <EventMemberViewer eventId={event.id} slug={event.slug} />
            </Suspense>
          </section>
        </>
      )}

      {section === 'guests' && (
        <>
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
            <SectionHeader title="Invited guests" />
            <Suspense fallback={<SectionFallback />}>
              <InvitedGuestsSection eventId={event.id} />
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
        </>
      )}

      {section === 'questions' && (
        <section>
          <SectionHeader title="Questionnaire" />
          <Suspense fallback={<SectionFallback />}>
            <QuestionnaireSection eventId={event.id} slug={event.slug} eventTitle={event.title} />
          </Suspense>
        </section>
      )}

      {section === 'tickets' && TICKETING_ENABLED && (
        <section>
          <SectionHeader title="Ticket tiers" />
          <Suspense fallback={<SectionFallback />}>
            <TicketTiersSection eventId={event.id} slug={event.slug} />
          </Suspense>
        </section>
      )}

      {section === 'updates' && (
        <section>
          <SectionHeader title="Sent Dispatches" />
          <Suspense fallback={<SectionFallback />}>
            <DispatchesSection eventId={event.id} />
          </Suspense>
        </section>
      )}

      {section === 'settings' && (
        <section>
          {/* The SAME inline event.settings module the admin rail mounts (module-map), in the
              entity-console card treatment — the catalog module is the one event editor, never a
              parallel form (MENU-CONTRACT). It reads the event scope from the live path and
              self-gates; autosaves in place. */}
          <SectionHeader title="Event settings" />
          <div className="rounded-card border border-border bg-surface p-5 lift-1">
            <EventSettingsModule />
          </div>
        </section>
      )}
    </DashboardTemplate>
  )
}
