import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, CalendarDays, MapPin, Lock } from 'lucide-react'
import { getPublicEventBySlug, formatEventDateTime, hasEventEnded } from '@/lib/discover'
import { SignInCta } from '@/components/discover/cards'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { eventSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)
  if (!event) return { title: 'Event not found' }

  const where = event.city ? ` in ${event.city}` : ''
  const description =
    event.description ??
    `${event.title}: a Frequency community event${where}. Sign in to RSVP.`
  return {
    title: event.title,
    description,
    alternates: { canonical: `/discover/events/${event.slug}` },
    openGraph: {
      title: `${event.title} · ${SITE_NAME}`,
      description,
      url: `/discover/events/${event.slug}`,
      type: 'article',
    },
  }
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)
  if (!event) notFound()

  const hasEnded = hasEventEnded(event)

  return (
    <div className="max-w-3xl mx-auto px-6 py-20 sm:py-24">
      <JsonLd
        data={[
          eventSchema(event),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Events', path: '/discover' },
            { name: event.title, path: `/discover/events/${event.slug}` },
          ]),
        ]}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-subtle mb-8">
        <Link href="/discover" className="hover:text-text transition-colors">Discover</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-muted">Events</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text font-medium truncate">{event.title}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
          Coming up
        </p>
        {hasEnded && (
          <span className="inline-block text-xs px-2 py-1 rounded-md font-medium bg-surface-elevated text-muted mb-3">
            This event has ended
          </span>
        )}
        <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-5">{event.title}</h1>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-text">
            <CalendarDays className="w-4 h-4 text-muted shrink-0" />
            <span>{formatEventDateTime(event.starts_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted">
            <MapPin className="w-4 h-4 shrink-0" />
            <span>
              {event.city ?? 'Location shared with members'}
            </span>
          </div>
          {event.circle_name && event.circle_id && (
            <div className="pt-1">
              <span className="text-subtle">Hosted by </span>
              <Link
                href={`/discover/circles/${event.circle_id}`}
                className="text-primary-strong hover:underline font-medium"
              >
                {event.circle_name}
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Description */}
      {event.description && (
        <section className="mb-8">
          <p className="text-lg text-muted leading-relaxed whitespace-pre-line">
            {event.description}
          </p>
        </section>
      )}

      {/* Location-protected notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-marketing-canvas p-4 mb-10">
        <Lock className="w-4 h-4 text-muted shrink-0 mt-0.5" />
        <p className="text-sm text-muted leading-relaxed">
          The exact venue is shared with members who RSVP. Sign up free to see the full
          details and let the host know you&apos;re coming.
        </p>
      </div>

      <SignInCta
        title={hasEnded ? 'Join Frequency' : 'Sign in to RSVP'}
        body={
          hasEnded
            ? 'This event has passed, but there is always something happening. Sign up free to find the next one near you.'
            : 'RSVP, see who else is going, and get the venue details. Free to join.'
        }
        action={hasEnded ? 'Get started' : 'Sign in to RSVP'}
      />
    </div>
  )
}
