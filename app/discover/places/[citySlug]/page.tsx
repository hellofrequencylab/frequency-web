import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Users, CalendarDays } from 'lucide-react'
import { getCityHub, listDiscoverCities, cityFromSlug } from '../_data'
import { CircleCard, EventRow } from '@/components/discover/cards'
import {
  PageHero,
  Section,
  SectionHeading,
  Stat,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { createClient } from '@/lib/supabase/server'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, circleListSchema, eventListSchema } from '@/lib/jsonld'
import { SITE_NAME, SITE_URL, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

export const revalidate = 3600

// Pre-render the places that actually have public activity. New cities still
// render on demand (dynamicParams defaults true) and join the set on revalidate.
export async function generateStaticParams() {
  const cities = await listDiscoverCities()
  return cities.map((c) => ({ citySlug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ citySlug: string }>
}): Promise<Metadata> {
  const { citySlug } = await params
  const hub = await getCityHub(citySlug)
  const city = hub?.city ?? cityFromSlug(citySlug)
  const title = `Community in ${city}`
  const description = hub
    ? `Find local Circles and real-world events in ${city}. ${hub.circles.length} ${
        hub.circles.length === 1 ? 'Circle' : 'Circles'
      } and ${hub.events.length} upcoming ${
        hub.events.length === 1 ? 'event' : 'events'
      } on Frequency. Browse for free, then show up in person.`
    : `Local Circles and real-world events in ${city} on Frequency.`
  const canonical = `/discover/places/${citySlug}`
  return {
    title,
    description,
    alternates: { canonical },
    // An empty place 404s, but guard the index signal anyway: a hub with nothing
    // live should never be advertised as a landing page.
    robots: hub ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: canonical,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} · ${SITE_NAME}`,
      description,
    },
  }
}

export default async function DiscoverPlacePage({
  params,
}: {
  params: Promise<{ citySlug: string }>
}) {
  const { citySlug } = await params
  const hub = await getCityHub(citySlug)
  if (!hub) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthed = !!user

  const { city, circles, events } = hub

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Places', path: '/discover/places' },
            { name: city, path: `/discover/places/${citySlug}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `Community in ${city}`,
            url: `${SITE_URL}/discover/places/${citySlug}`,
            about: { '@type': 'Place', name: city, address: { '@type': 'PostalAddress', addressLocality: city } },
          },
          circles.length > 0 && circleListSchema(circles, `Circles in ${city}`),
          events.length > 0 && eventListSchema(events, `Upcoming events in ${city}`),
        ].filter(Boolean)}
      />

      <PageHero
        eyebrow="Discover by place"
        title={
          <>
            Community in <span className="text-primary">{city}</span>
          </>
        }
        subtitle={`The Circles meeting and the events happening in ${city} this season. Browse them free, then sign up to join one, RSVP, or start your own.`}
      />

      {/* ── At a glance ─────────────────────────────────────────── */}
      <Section tone="canvas" pad="pb-14 sm:pb-20">
        <div className="grid grid-cols-2 gap-8 text-center sm:gap-12">
          <Stat value={circles.length} label={circles.length === 1 ? 'Circle' : 'Circles'} />
          <Stat
            value={events.length}
            label={events.length === 1 ? 'Upcoming event' : 'Upcoming events'}
          />
        </div>
      </Section>

      {/* ── Circles ─────────────────────────────────────────────── */}
      {circles.length > 0 && (
        <Section tone="surface" className="!max-w-none">
          <div className="mx-auto max-w-4xl">
            <SectionHeading
              eyebrow="Find your people"
              title={
                <>
                  Circles in <span className="text-primary">{city}</span>
                </>
              }
              kicker="Up to fifty neighbors, small enough to know everyone."
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {circles.map((c) => (
                <CircleCard key={c.id} circle={c} isAuthed={isAuthed} />
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* ── Events ──────────────────────────────────────────────── */}
      {events.length > 0 && (
        <Section tone="canvas" className="!max-w-none">
          <div className="mx-auto max-w-3xl">
            <SectionHeading
              eyebrow="Coming up"
              title={
                <>
                  Happening in <span className="text-primary">{city}</span>
                </>
              }
              kicker="Real plans, on real days, with room for you."
            />
            <div className="space-y-3">
              {events.map((e) => (
                <EventRow key={e.id} event={e} isAuthed={isAuthed} />
              ))}
            </div>
            <div className="mt-8">
              <Link
                href="/discover/events"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline"
              >
                Browse all events <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Section>
      )}

      {/* ── Cross-links: the other ways to browse ───────────────── */}
      <Section tone="surface">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          <Link href="/discover/places" className="inline-flex items-center gap-1.5 font-semibold text-primary-strong hover:underline">
            <Users className="h-4 w-4" /> All places
          </Link>
          <Link href="/discover/circles" className="inline-flex items-center gap-1.5 font-semibold text-primary-strong hover:underline">
            <Users className="h-4 w-4" /> All Circles
          </Link>
          <Link href="/discover/events" className="inline-flex items-center gap-1.5 font-semibold text-primary-strong hover:underline">
            <CalendarDays className="h-4 w-4" /> All events
          </Link>
        </div>
      </Section>

      <BetaCTA
        heading={`Your people are already gathering in ${city}`}
        body="Frequency is free to join. Sign up, find a Circle near you, and start showing up this week."
      />

      <div className="px-6 pb-16 text-center">
        <Button href={BETA_CTA_HREF} variant="ghost">
          {BETA_CTA_LABEL} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  )
}
