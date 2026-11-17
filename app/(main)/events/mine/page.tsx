import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarCheck, CalendarDays, CalendarPlus } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { listOperatedSpaces } from '@/lib/spaces/operated'
import { loadMyEvents, SPACE_EVENTS_SHOWN, type MyEventRow } from '@/lib/events/my-events'
import { formatEventWhen } from '@/lib/time/zone'

// MY EVENTS (LIVE-2337): every event that is yours, on one page. Going (your RSVPs), Hosting (events you
// host or posted, drafts included) and, for a Space owner or admin, each Space's upcoming events with a
// door into that Space's calendar. Linked from the Events page, the member Events hub row, the left menu
// (a DB row, menus/menu_items) and the Space console. A list of your own things wears no photo band
// (owner, 2026-10-14), same as My orders.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My events' }

function EventLine({ e, manage }: { e: MyEventRow; manage?: boolean }) {
  const draft = e.status === 'draft'
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <Link href={draft ? `/events/drafts/${e.id}` : `/events/${e.slug}`} className="text-body font-semibold text-text hover:underline">
          {e.title}
        </Link>
        <p className="mt-0.5 text-body-sm text-muted">
          {formatEventWhen(e.startsAt, e.timeZone, { style: 'dayTime' })}
          {e.location ? ` · ${e.location}` : null}
          {draft ? ' · Draft' : null}
          {e.isCancelled ? ' · Cancelled' : null}
        </p>
      </div>
      {manage && !draft && (
        <Link href={`/events/${e.slug}/manage`} className={buttonClasses('secondary', 'sm')}>
          Manage
        </Link>
      )}
    </li>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8" aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-body-lg font-semibold text-text">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default async function MyEventsPage() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/events/mine')

  const spaces = await listOperatedSpaces(profileId)
  const { going, hosting, spaces: spaceEvents } = await loadMyEvents(
    profileId,
    spaces.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
  )

  return (
    <IndexTemplate
      title="My events"
      description="What you're going to, what you're hosting, and what's on at your Spaces."
      back={{ href: '/events', label: 'All events' }}
      action={
        <Link href="/events/new" className={buttonClasses('primary', 'md')}>
          <CalendarPlus className="h-4 w-4" aria-hidden />
          New event
        </Link>
      }
    >
      <Section id="my-events-going" title="Going">
        {going.length > 0 ? (
          <ul className="space-y-2">
            {going.map((e) => (
              <EventLine key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title="Nothing on your calendar yet."
            description="RSVP to an event and it lands here, so you can find it again in one tap."
            action={
              <Link href="/events" className={buttonClasses('primary', 'md')}>
                Find something to go to
              </Link>
            }
          />
        )}
      </Section>

      <Section id="my-events-hosting" title="Hosting">
        {hosting.length > 0 ? (
          <ul className="space-y-2">
            {hosting.map((e) => (
              <EventLine key={e.id} e={e} manage />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarPlus}
            title="You're not hosting anything yet."
            description="Start an event and you can manage the guest list, tickets and check in from here."
            action={
              <Link href="/events/new" className={buttonClasses('primary', 'md')}>
                Host an event
              </Link>
            }
          />
        )}
      </Section>

      {spaceEvents.map((s) => (
        <Section key={s.spaceId} id={`my-events-space-${s.spaceId}`} title={`At ${s.name}`}>
          {s.events.length > 0 ? (
            <ul className="space-y-2">
              {s.events.slice(0, SPACE_EVENTS_SHOWN).map((e) => (
                <EventLine key={e.id} e={e} manage />
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-muted">No upcoming events at {s.name}.</p>
          )}
          <Link href={`/spaces/${s.slug}/settings/calendar`} className={`${buttonClasses('secondary', 'sm')} mt-3`}>
            <CalendarDays className="h-4 w-4" aria-hidden />
            {s.events.length > SPACE_EVENTS_SHOWN ? `See all ${s.events.length} on the calendar` : 'Open the calendar'}
          </Link>
        </Section>
      ))}
    </IndexTemplate>
  )
}
