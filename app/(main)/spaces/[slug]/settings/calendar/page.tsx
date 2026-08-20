import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { listSpaceCalendarEvents, listCalendarEngagement, listEventsForSpace } from '@/lib/events/store'
import { formatEventWhen, eventInstant } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { SITE_URL } from '@/lib/site'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { EventShareApprovals } from '@/components/events/event-share-approvals'
import { SectionHeader } from '@/components/ui/section-header'
import { SpaceEventsManager, type ManagedEvent } from './space-events-manager'

// THE SPACE CALENDAR CONSOLE (Events EC2/EC3/EC5, upgraded 2026-07-25). The MANAGEMENT calendar for a
// space's events: the month grid AND the chronological list (the calendar's own toggle), every item
// clickable through to the editor, drafts and past events included, co-hosted events labeled, and the
// pending co-host requests inline. Gated on the `events` function (universal, editor+). The public
// Calendar tab stays the view-only surface; THIS one is where a Collective or studio actually runs its
// calendar. Mirrors the offerings/collaborators pattern: a no-rail Focus surface, gated server-side.

export const metadata = { title: 'Calendar' }

export default async function SpaceCalendarConsolePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()
  setActiveSpace(space)

  const brandName = space.brandName ?? space.name
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked = !staffViewing && !spaceFunctionAccess(space, 'events', caps.role)

  const now = new Date()
  const initialYear = now.getUTCFullYear()
  const initialMonth1 = now.getUTCMonth() + 1
  const nowIso = now.toISOString()

  // The MANAGEMENT set: every event under this space (drafts, past, cancelled included), plus the
  // co-hosted events other hosts share onto this calendar (view-only here; their editor lives with
  // their own host). Engagement resolves per-event; the tz lib stays server-side (pre-formatted).
  // includeUnpublished: this is the OPERATOR's console calendar and it badges drafts on purpose.
  // It is the one caller that opts out of listEventsForSpace's publication gate (lib/events/store.ts);
  // every public reader takes the gated default.
  const ownedRows = featureLocked ? [] : await listEventsForSpace(space.id, { limit: 200, includeUnpublished: true })
  const ownedIds = new Set(ownedRows.map((r) => r.id))
  const sharedRows = featureLocked
    ? []
    : (await listSpaceCalendarEvents(space.id, { fromDay: `${initialYear - 1}-01-01` })).filter(
        (r) => !ownedIds.has(r.id),
      )
  const engagement =
    ownedRows.length || sharedRows.length
      ? await listCalendarEngagement([...ownedRows.map((r) => r.id), ...sharedRows.map((r) => r.id)])
      : new Map()

  // Only a manager gets the click-to-edit affordance; a staff preview stays read-only.
  const editHrefFor = (evSlug: string) => (canManage ? `/events/${evSlug}/edit` : null)

  const events: CalendarEvent[] = [
    ...ownedRows.map((ev): CalendarEvent | null => {
      const dayKey = eventDayKey(ev.starts_at)
      if (!dayKey) return null
      const eng = engagement.get(ev.id)
      const isPast = ev.starts_at < nowIso
      return {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }),
        whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
        startInstantIso: eventInstant(ev.starts_at, ev.time_zone)?.toISOString() ?? null,
        location: ev.location,
        goingCount: eng?.going ?? 0,
        coverUrl: eng?.coverUrl ?? null,
        coverFocus: eng?.coverFocus ?? null,
        statusLabel: ev.status === 'draft' ? 'Draft' : isPast ? 'Past' : null,
        editHref: editHrefFor(ev.slug),
        isCancelled: !!ev.is_cancelled,
      }
    }),
    ...sharedRows.map((ev): CalendarEvent | null => {
      const dayKey = eventDayKey(ev.starts_at)
      if (!dayKey) return null
      const eng = engagement.get(ev.id)
      return {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }),
        whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
        startInstantIso: eventInstant(ev.starts_at, ev.time_zone)?.toISOString() ?? null,
        location: ev.location,
        goingCount: eng?.going ?? 0,
        coverUrl: eng?.coverUrl ?? null,
        coverFocus: eng?.coverFocus ?? null,
        sourceLabel: 'Co-hosted here',
        isCancelled: !!ev.is_cancelled,
      }
    }),
  ].filter((e): e is CalendarEvent => e !== null)

  const upcomingCount = ownedRows.filter((r) => r.starts_at >= nowIso && !r.is_cancelled).length

  // The deep-management table below the calendar: duplicate / cancel / delete per event.
  const managedEvents: ManagedEvent[] = ownedRows.map((ev) => ({
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
    isPast: ev.starts_at < nowIso,
    isCancelled: !!ev.is_cancelled,
  }))

  const httpsUrl = `${SITE_URL}/spaces/${slug}/calendar.ics`
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Calendar"
      description="Run your space's calendar. Calendar and list views, click any event to edit it, and approve co-hosted events other hosts bring you."
      width={featureLocked ? undefined : 'wide'}
    >
      {featureLocked ? (
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="Calendar"
          reason={spaceFunctionAccess(space, 'events', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-muted">
              {upcomingCount > 0
                ? `${upcomingCount} upcoming event${upcomingCount === 1 ? '' : 's'}.`
                : 'No upcoming events yet. Create your first one.'}
            </p>
            <div className="flex items-center gap-2">
              <CalendarSubscribeMenu
                httpsUrl={httpsUrl}
                webcalUrl={webcalUrl}
                title={`${brandName} in your calendar`}
                description={`Subscribe once and ${brandName}'s events show up in Google or Apple Calendar, and stay current on their own.`}
              />
              <Link
                href={`/events/new?space=${space.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" aria-hidden /> New event
              </Link>
            </div>
          </div>

          {/* Pending co-host requests (renders nothing when the inbox is empty). */}
          <EventShareApprovals spaceId={space.id} />

          {events.length > 0 ? (
            <EventCalendar events={events} initialYear={initialYear} initialMonth1={initialMonth1} />
          ) : (
            <div className="rounded-card border border-dashed border-border bg-surface px-4 py-10 text-center">
              <p className="text-body-sm font-semibold text-text">Your calendar is ready.</p>
              <p className="mt-1 text-body-sm text-muted">
                Create an event and it shows up here, on your public Calendar tab, and in the subscribe feed.
              </p>
              <Link
                href={`/events/new?space=${space.id}`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" aria-hidden /> Create your first event
              </Link>
            </div>
          )}

          {managedEvents.length > 0 && (
            <div className="pt-2">
              <SectionHeader title="Manage events" count={managedEvents.length} />
              <SpaceEventsManager events={managedEvents} />
            </div>
          )}
        </div>
      )}
    </FocusTemplate>
  )
}
