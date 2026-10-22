import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventsListingSchema } from '@/lib/jsonld'
import { formatEventWhen } from '@/lib/time/zone'
import type { UpcomingFeedRow } from '@/lib/calendar/member-calendar'

// WHAT A CRAWLER OR AN ANSWER ENGINE READS ON A SPACE'S CALENDAR (Space calendar redesign, 2026-10-22).
//
// An answer-first sentence a person can read too ("3 events are coming up at X. Next: Y, Fri, Oct 30,
// 7:00 PM PDT."), then the structured data: an ItemList of the upcoming events and the breadcrumb.
// Every row arrives through the SAME gated reader the Up next band uses (loadSpaceUpcomingFeed), so
// pencil, planning, private and cancelled dates cannot reach the markup. The month grid is the
// enhancement; this is the part that is true without JavaScript.
export function CalendarSeo({
  slug,
  brandName,
  timeZone,
  rows,
}: {
  slug: string
  brandName: string
  timeZone: string | null
  rows: readonly UpcomingFeedRow[]
}) {
  const next = rows[0]
  const count = rows.length
  const sentence = next
    ? `${count} ${count === 1 ? 'event is' : 'events are'} coming up at ${brandName}. Next: ${next.title}, ${formatEventWhen(next.starts_at, timeZone)}.`
    : `Nothing is scheduled at ${brandName} right now. Subscribe and new events show up in your calendar on their own.`
  return (
    <>
      <p className="text-body-sm text-muted" data-calendar-summary>
        {sentence}
      </p>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Spaces', path: '/spaces' },
            { name: brandName, path: `/spaces/${slug}` },
            { name: 'Calendar', path: `/spaces/${slug}/calendar` },
          ]),
          ...(count > 0
            ? [
                eventsListingSchema(
                  rows.map((r) => ({ slug: r.slug, title: r.title, starts_at: r.starts_at, time_zone: timeZone })),
                  `Upcoming events at ${brandName}`,
                ),
              ]
            : []),
        ]}
      />
    </>
  )
}
