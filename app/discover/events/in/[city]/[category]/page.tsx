import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, cityEventListSchema } from '@/lib/jsonld'
import { meetsIndexFloor } from '@/lib/seo/index-floor'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import {
  getCategoryBySlug,
  getCityCategoryHub,
  getCityCategoryHubs,
} from '../../../_data'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { FrequencyEventHub } from '@/components/frequency/site/pages/discover/frequency-discover-events'

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
  const path = `/discover/events/in/${hub.citySlug}/${cat.slug}`
  const ogTitle = `${title} · ${SITE_NAME}`

  return {
    title,
    description,
    alternates: { canonical: path },
    // THE LOCAL INDEX FLOOR (LIVE-807): a city × practice page with fewer than 3 upcoming Events
    // renders for the visitor but is not indexed, the same rule app/sitemap.ts reads.
    ...(meetsIndexFloor({ upcomingEvents: count }) ? {} : { robots: { index: false, follow: true } }),
    openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: ogTitle, description, url: path },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function CityCategoryHubPage({ params }: Params) {
  const { city, category } = await params
  const cat = getCategoryBySlug(category)
  if (!cat) notFound()

  const hub = await getCityCategoryHub(city, category)
  if (!hub || hub.events.length === 0) notFound()

  const path = `/discover/events/in/${hub.citySlug}/${cat.slug}`

  // Sibling categories that also have events in this city — internal links that
  // give the hub real navigational value (and spread crawl across live facets).
  const siblings = (await getCityCategoryHubs()).filter(
    (h) => h.citySlug === hub.citySlug && h.category.slug !== cat.slug,
  )
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Events', path: '/discover/events' },
            { name: `${cat.label} in ${hub.city}`, path },
          ]),
          cityEventListSchema(hub.events, `${cat.label} in ${hub.city}`),
        ]}
      />
      <FrequencyEventHub
        city={hub.city}
        label={cat.label}
        noun={cat.noun}
        nounSingular={cat.nounSingular}
        events={hub.events}
        today={dayInZone(new Date(), HOME_TZ)}
        siblings={siblings.map((s) => ({
          href: `/discover/events/in/${s.citySlug}/${s.category.slug}`,
          label: s.category.label,
          count: s.events.length,
        }))}
      />
    </>
  )
}
