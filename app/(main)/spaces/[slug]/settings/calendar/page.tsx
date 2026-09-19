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
import { countSeries, type SeriesRow } from '@/lib/events/series'
import { upcomingEventFloor } from '@/lib/events/upcoming-floor'
import { SITE_URL } from '@/lib/site'
import type { CalendarEvent } from '@/components/events/event-calendar'
import { StaffCalendar } from './staff-calendar'
import { loadAdminCalendar } from '@/lib/calendar/admin-calendar'
import { formatEventWhen } from '@/lib/time/zone'
import { DayNotesField } from './day-notes-field'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { EventShareApprovals } from '@/components/events/event-share-approvals'
import { SectionHeader } from '@/components/ui/section-header'
import { SpaceEventsManager, type ManagedEvent } from './space-events-manager'
import { listSpacePlans, listPlaybooks } from '@/lib/calendar/plans-store'
import { CalendarPlansPanel } from './calendar-plans-panel'

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

  // The team's calendar: every event under this Space, co-hosted events, the private layer and day notes
  // (lib/calendar/admin-calendar.ts, shared with the Admin mode of the public Calendar tab).
  const { events, ownedRows, dayNotes } = featureLocked
    ? { events: [] as CalendarEvent[], ownedRows: [], dayNotes: [] }
    : await loadAdminCalendar(space.id, { canManage, year: initialYear, month1: initialMonth1, now })

  const plans = featureLocked || !canManage ? [] : await listSpacePlans(space.id)
  const playbooks = featureLocked || !canManage ? [] : await listPlaybooks(space.id)

  // "N upcoming events." — GATHERINGS, not materialised occurrences (LIVE-198 / SERIES-COUNT).
  // Recurrence is materialised (ADR-007), so a weekly series is ~9 rows inside the cron's 60-day
  // horizon and the operator's own console told them they had nine events when they have one. The
  // fold owns both gates (cancelled + the floor), so this is one call rather than a hand-rolled
  // filter that could drift from the lists on the same page.
  const upcomingCount = countSeries(ownedRows as SeriesRow[], { upcomingFrom: upcomingEventFloor(now) })

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
      description="Run your space's calendar. Your public events, plus private entries and unavailable time only your team can see."
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
                className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" aria-hidden /> New event
              </Link>
            </div>
          </div>

          {/* Pending co-host requests (renders nothing when the inbox is empty). */}
          <EventShareApprovals spaceId={space.id} />

          <StaffCalendar
            slug={space.slug}
            spaceId={space.id}
            events={events}
            initialYear={initialYear}
            initialMonth1={initialMonth1}
            canEdit={canManage}
            dayNotes={dayNotes}
            plans={plans}
          />

          <DayNotesField slug={space.slug} notes={dayNotes} canEdit={canManage} />

          {canManage && (
            <CalendarPlansPanel slug={space.slug} spaceId={space.id} plans={plans} playbooks={playbooks} />
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
