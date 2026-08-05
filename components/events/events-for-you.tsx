import { Sparkles } from 'lucide-react'
import { scoreEventsForViewer } from '@/lib/events/matching'
import { eventBlurb } from '@/lib/ai/event-blurb'
import { EventCard } from '@/components/events/event-card'
import type { EventsIndexData } from '@/app/(main)/events/index-data'

// "For You" — the personalized lane on the events library (Events B-4).
//
// This composes three pieces that were built, documented as shipped in
// docs/EVENTS-SYSTEM.md, and then never mounted: the hybrid interest+social+context ranking
// (lib/events/matching.ts), the per-event "why you'd vibe" blurb (lib/ai/event-blurb.ts), and the
// connector suggestions rendered by its sibling <EventConnectors>. The /events index was already
// computing `showForYou` to gate exactly this, so the gate existed with nothing behind it.
//
// SLOW BY DESIGN, so it must never block the shell: scoring reads embeddings and the blurbs are an
// AI call. The caller mounts this inside its own <Suspense>, which is what the index-data comment
// always said would happen (PAGE-FRAMEWORK §5).
//
// FAIL-SAFE throughout: no scores, no lane. Blurbs resolve independently of one another and a null
// blurb simply renders the card without one — `eventBlurb` already returns null when its kill switch
// or daily budget cap is hit, so the lane degrades to a plain ranked list rather than disappearing.

/** How many ranked events the lane shows. Small on purpose: this is a recommendation, not a feed. */
const LANE_SIZE = 4

export async function EventsForYou({
  viewerProfileId,
  events,
  circleNames,
  coverUrls,
  coverFocus,
  rsvpCounts,
  priceLabels,
  nowDate,
}: {
  viewerProfileId: string
  events: EventsIndexData['sortedEvents']
  circleNames: EventsIndexData['circleNames']
  coverUrls: EventsIndexData['coverUrls']
  coverFocus: EventsIndexData['coverFocus']
  rsvpCounts: EventsIndexData['rsvpCounts']
  priceLabels: EventsIndexData['priceLabels']
  nowDate: EventsIndexData['nowDate']
}) {
  // Rank only what the page is already showing, so the lane can never surface an event the
  // member's current filters exclude.
  const byId = new Map(events.map((e) => [e.id, e]))
  let ranked
  try {
    ranked = await scoreEventsForViewer(viewerProfileId, [...byId.keys()])
  } catch {
    return null
  }

  const top = ranked.filter((r) => byId.has(r.eventId)).slice(0, LANE_SIZE)
  // One ranked event is not a recommendation, it is just the next event. Two is the floor.
  if (top.length < 2) return null

  // Blurbs are per-event and independent; one failing must not cost the others.
  const blurbs = await Promise.all(
    top.map((r) =>
      eventBlurb(viewerProfileId, r.eventId).catch(() => null),
    ),
  )

  return (
    <section aria-labelledby="events-for-you" className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary-strong" />
        <h2 id="events-for-you" className="text-body-sm font-bold tracking-tight text-text">
          For you
        </h2>
      </div>
      <p className="text-2xs text-muted">
        Picked from what is coming up, by what you are into and who is going.
      </p>

      <div className="mp-grid gap-4">
        {top.map((r, i) => {
          const event = byId.get(r.eventId)!
          return (
            <div key={r.eventId} className="space-y-2">
              <EventCard
                event={event}
                circleName={circleNames[event.scope_id]}
                coverUrl={coverUrls[event.id]}
                coverFocus={coverFocus[event.id]}
                going={rsvpCounts[event.id] ?? 0}
                priceLabel={priceLabels[event.id] ?? 'Free'}
                now={nowDate}
              />
              {blurbs[i] ? <p className="px-1 text-2xs text-muted">{blurbs[i]}</p> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
