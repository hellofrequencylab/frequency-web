import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EventRow } from '@/components/discover/cards'
import {
  FrequencyArcs,
  OrganicBlob,
} from '@/components/marketing/vector-art'
import {
  SectionHeading,
  Statement,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventListSchema } from '@/lib/jsonld'
import { SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import {
  getCategoryBySlug,
  getCityCategoryHub,
  getCityCategoryHubs,
} from '../../_data'

// ── City × category event hub (EVENTS-REWORK SEO) ─────────────────────────────
// An indexable landing page for one city + one event category, whose value is the
// LIVE LIST of real upcoming events there — never boilerplate. We only render (and
// only sitemap) pairs that actually have events: getCityCategoryHub returns null
// for an empty pair, so the route 404s and the low-value facet never enters the
// index. Privacy unchanged: city-level only, the exact venue is members-only.

export const revalidate = 3600
// Only the pairs we pre-rendered (those with events) are valid. Any other
// city/category combination 404s instead of rendering an empty facet.
export const dynamicParams = true

export async function generateStaticParams(): Promise<{ city: string; category: string }[]> {
  try {
    const hubs = await getCityCategoryHubs()
    return hubs.map((h) => ({ city: h.citySlug, category: h.category.slug }))
  } catch {
    return []
  }
}

type Params = { params: Promise<{ city: string; category: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city, category } = await params
  const cat = getCategoryBySlug(category)
  if (!cat) return { title: 'Events not found' }

  const hub = await getCityCategoryHub(city, category)
  if (!hub) return { title: 'Events not found', robots: { index: false, follow: true } }

  const count = hub.events.length
  // Unique, data-driven title + description (the count + city + category are real,
  // not boilerplate). Plain voice, no em dashes, one honest number.
  const title = `${cat.label} in ${hub.city}`
  const description = `${count} upcoming ${count === 1 ? cat.nounSingular : cat.noun} in ${hub.city} on ${SITE_NAME}. Public pages show the city only; the exact venue is shared with members who RSVP.`
  const path = `/discover/events/${hub.citySlug}/${cat.slug}`
  const ogTitle = `${title} · ${SITE_NAME}`

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: ogTitle, description, url: path },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function CityCategoryHubPage({ params }: Params) {
  const { city, category } = await params
  const cat = getCategoryBySlug(category)
  if (!cat) notFound()

  const hub = await getCityCategoryHub(city, category)
  if (!hub || hub.events.length === 0) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthed = !!user

  const count = hub.events.length
  const path = `/discover/events/${hub.citySlug}/${cat.slug}`

  // Sibling categories that also have events in this city — internal links that
  // give the hub real navigational value (and spread crawl across live facets).
  const siblings = (await getCityCategoryHubs()).filter(
    (h) => h.citySlug === hub.citySlug && h.category.slug !== cat.slug,
  )

  return (
    <div className="relative overflow-hidden max-w-3xl mx-auto px-6 py-20 sm:py-24">
      <FrequencyArcs
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 w-[28rem] max-w-none text-primary opacity-[0.05]"
      />

      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Events', path: '/discover/events' },
            { name: `${cat.label} in ${hub.city}`, path },
          ]),
          eventListSchema(hub.events, `${cat.label} in ${hub.city}`),
        ]}
      />

      <Link
        href="/discover/events"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Events
      </Link>

      <SectionHeading
        eyebrow={`${hub.city} · ${cat.label}`}
        title={
          <>
            {cat.label} in <span className="text-primary">{hub.city}</span>
          </>
        }
        kicker={`${count} on the calendar right now.`}
      />

      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
        Here&rsquo;s every {cat.nounSingular} coming up in {hub.city}. Pick one, RSVP, and
        you&rsquo;re expected. Public pages show the city only; the exact venue is shared with
        members who RSVP.
      </p>

      <div className="mt-9 space-y-3">
        {hub.events.map((e) => (
          <div key={e.id} className="transition-transform hover:-translate-y-0.5">
            <EventRow event={e} isAuthed={isAuthed} />
          </div>
        ))}
      </div>

      {siblings.length > 0 && (
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            More in {hub.city}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {siblings.map((s) => (
              <Link
                key={s.category.slug}
                href={`/discover/events/${s.citySlug}/${s.category.slug}`}
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-border-strong"
              >
                {s.category.label} ({s.events.length})
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="relative mt-16 overflow-hidden">
        <OrganicBlob
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-16 w-[26rem] max-w-none text-primary opacity-[0.04]"
        />
        <Statement tone="ink">
          Friendship happens <span className="text-primary">in person</span>.
        </Statement>
      </div>

      <div className="mt-12">
        <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
      </div>

      <div className="mt-16">
        <BetaCTA
          heading="See you there"
          body={`Join the beta to RSVP to ${cat.noun} in ${hub.city}, meet your neighbors, and get the exact venue.`}
        />
      </div>
    </div>
  )
}
