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
import { SectionHeader } from '@/components/ui/section-header'
import { SpaceEventsManager, type ManagedEvent } from './space-events-manager'

// THE SPACE CALENDAR CONSOLE (Events EC2/EC3). The owner-facing home for a space's events: the month grid
// of its events, a "New event" entry, and the public subscribe link to share. Gated on the `events`
// function (universal, editor+). This is the surface that was missing — a space had a PUBLIC Calendar tab
// only once it already had events, and no console entry at all, so a new business space saw no calendar
// options. Mirrors the offerings/collaborators pattern: a no-rail Focus surface, gated server-side.

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
  const fromDay = `${initialYear}-${String(initialMonth1).padStart(2, '0')}-01`

  // The space's own upcoming events (published, public/unlisted). Engagement + times pre-formatted
  // server-side (the timezone lib never ships to the client), same mapping as the public Calendar tab.
  const rows = featureLocked ? [] : await listSpaceCalendarEvents(space.id, { fromDay })
  const engagement = rows.length ? await listCalendarEngagement(rows.map((r) => r.id)) : new Map()
  const events: CalendarEvent[] = rows
    .map((ev): CalendarEvent | null => {
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
        isCancelled: !!ev.is_cancelled,
      }
    })
    .filter((e): e is CalendarEvent => e !== null)

  // The full management list: EVERY event under this space (past + upcoming, all statuses),
  // unlike the month grid which shows only published/upcoming. This is where the owner edits,
  // duplicates, cancels, and deletes — the actions the view-only calendar never exposed.
  const nowIso = now.toISOString()
  const managedRows = featureLocked ? [] : await listEventsForSpace(space.id, { limit: 100 })
  const managedEvents: ManagedEvent[] = managedRows.map((ev) => ({
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
      description="Your space's events on one calendar. Create an event, see what's upcoming, and share a subscribe link so anyone can follow along."
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
            <p className="text-sm text-muted">
              {events.length > 0
                ? `${events.length} upcoming event${events.length === 1 ? '' : 's'}.`
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" aria-hidden /> New event
              </Link>
            </div>
          </div>

          {events.length > 0 ? (
            <EventCalendar events={events} initialYear={initialYear} initialMonth1={initialMonth1} />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center">
              <p className="text-sm font-semibold text-text">Your calendar is ready.</p>
              <p className="mt-1 text-sm text-muted">
                Create an event and it shows up here, on your public Calendar tab, and in the subscribe feed.
              </p>
              <Link
                href={`/events/new?space=${space.id}`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
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
