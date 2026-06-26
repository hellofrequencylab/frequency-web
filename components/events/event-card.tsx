import Image from 'next/image'
import { MapPin, Users, Globe, Calendar } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { DemoBadge } from '@/components/ui/demo-badge'
import { FeaturedBadge } from '@/components/ui/featured-badge'
import { RsvpButton } from '@/components/events/rsvp-button'
import { formatWhen, type EventRow } from '@/app/(main)/events/index-data'

function eventDate(iso: string) {
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    day: d.getDate(),
  }
}

// Generated cover for events without an uploaded photo — so every card carries
// the same visual weight as a circle card's no-image fallback (mirrors
// circle-card.tsx: the from-primary-bg via-surface-elevated to-signal-bg
// gradient). The date sits large and centered, with a small calendar mark.
function CoverFallback({ iso }: { iso: string }) {
  const { month, day } = eventDate(iso)
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong">
      <Calendar className="h-5 w-5 opacity-70" aria-hidden />
      <span className="mt-1.5 text-xs font-semibold uppercase leading-none tracking-wide">{month}</span>
      <span className="text-4xl font-bold leading-tight">{day}</span>
    </div>
  )
}

// Warm, never-FOMO scarcity badge. Capacity is the ONLY real scarcity signal
// (events.capacity; null = unlimited). We surface care/momentum, never pressure:
//   • "Waitlist" when genuinely full (going ≥ capacity)
//   • "Filling up" ONLY when near-full — spots left > 0 AND ≤ 20% of capacity
// No low/zero counts, no countdowns, no fake urgency (EVENTS-SYSTEM §4, Law 1).
function WarmBadge({ capacity, going }: { capacity: number | null; going: number }) {
  if (capacity == null) return null
  const spotsLeft = Math.max(0, capacity - going)
  if (spotsLeft === 0) {
    return (
      <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
        Waitlist
      </span>
    )
  }
  if (spotsLeft <= capacity * 0.2) {
    return (
      <span className="shrink-0 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
        Filling up
      </span>
    )
  }
  return null
}

export function EventCard({
  event, circleName, coverUrl, going, isGoing, now, canRsvp, blurb,
}: {
  event: EventRow
  circleName?: string
  /** Public URL of the event's expressive cover, when it has one. */
  coverUrl?: string
  going: number
  isGoing: boolean
  now: Date
  canRsvp: boolean
  /** Optional AI "why you'd vibe" line — only set on the "For you" lane. */
  blurb?: string
}) {
  const warm = <WarmBadge capacity={event.capacity} going={going} />
  // At capacity → the one-tap RSVP joins the waitlist (framed as care, not scarcity).
  // RsvpButton already supports this; the index just needs to pass it.
  const isFull = event.capacity != null && going >= event.capacity
  // Standalone public events carry a calm `Public` provenance chip + the
  // organizer name; circle events carry the {Circle} pill (ADR-254).
  const provenance = event.is_public_standalone ? (
    <span className="flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 font-medium text-muted">
      <Globe className="h-3 w-3" />Public
    </span>
  ) : circleName ? (
    <span className="rounded-full bg-primary-bg px-2 py-0.5 font-medium text-primary-strong">
      {circleName}
    </span>
  ) : null
  return (
    <EntityCard
      href={`/events/${event.slug}`}
      // Lead with the expressive cover when the event has one (EVENTS-DESIGN
      // §3.2 — reads like Luma Discover). When it doesn't, a generated date
      // cover gives the card the same visual weight as a circle card's no-image
      // fallback, so every event reads rich rather than sparse.
      cover={
        coverUrl ? (
          <Image src={coverUrl} alt="" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        ) : (
          <CoverFallback iso={event.starts_at} />
        )
      }
      title={event.title}
      description={blurb}
      badge={
        (event.featured_at || event.is_demo || warm) ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {event.featured_at && <FeaturedBadge />}
            {event.is_demo && <DemoBadge />}
            {warm}
          </span>
        ) : undefined
      }
      context={formatWhen(event.starts_at, now)}
      meta={
        <>
          {provenance}
          {event.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />{event.location}
            </span>
          )}
          {going > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />{going} going
            </span>
          )}
          {event.host && <span>Hosted by {event.host.display_name}</span>}
        </>
      }
      action={canRsvp ? <RsvpButton eventId={event.id} isGoing={isGoing} isFull={isFull} /> : undefined}
    />
  )
}
