import Link from 'next/link'
import { CalendarDays, MapPin } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { SectionHeader } from '@/components/ui/section-header'
import { formatEventDate } from '@/lib/utils'
import { getEventsAdminData } from '@/app/(main)/admin/events/load-events'
import { LeadCreatePrompt } from './lead-create-prompt'

// Leadership dashboard layout module (ADR-270): "Upcoming in your circles" — the next gatherings
// scheduled across the circles this leader hosts/stewards. Self-fetching RSC scoped to the caller
// via getCallerProfile; getEventsAdminData is already keyed to the host's circles + the events they
// host directly, so there is no platform-wide read. Self-hides when there is nothing upcoming.
export async function LeadEvents(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const eventsData = await getEventsAdminData(me.id)
  const upcoming = eventsData.upcoming
  // Always render (owner directive): no upcoming gathering -> a prompt to schedule one, rather than
  // the section self-hiding.
  if (upcoming.length === 0) {
    return (
      <LeadCreatePrompt
        section="Upcoming in your circles"
        icon={CalendarDays}
        title="Nothing on the calendar yet"
        description="Events are how your circles gather in person or online. Schedule one and it shows up here, with RSVPs and reminders handled for you."
        ctaHref="/events/new"
        ctaLabel="Create an event"
      />
    )
  }

  return (
    <section>
      <SectionHeader title="Upcoming in your circles" count={upcoming.length} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {upcoming.map((e) => (
          <li key={e.id}>
            <Link
              href={`/events/${e.slug}`}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{e.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-subtle">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    {formatEventDate(e.starts_at)}
                  </span>
                  {e.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      <span className="truncate">{e.location}</span>
                    </span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
