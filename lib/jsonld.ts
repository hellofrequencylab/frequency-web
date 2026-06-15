// ── JSON-LD structured data (AEO) ─────────────────────────────────────────────
// Schema.org builders for answer-engine / rich-result eligibility. Everything
// here respects the same privacy contract as the rest of /discover: Event
// location is CITY-LEVEL ONLY (addressLocality), never a precise venue. When a
// city isn't known we describe the location generically rather than leak it.

import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'
import type { PublicCircle, PublicEvent, TopicalChannel } from '@/lib/discover'
import type { JourneyPlan, JourneyPlanItem } from '@/lib/journey-plans'

const abs = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

// ── Site-wide ─────────────────────────────────────────────────────────────────

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: abs('/icons/icon-192.png'),
    description: SITE_DESCRIPTION,
    email: 'hello@frequencylocal.com',
  }
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
  }
}

// ── Breadcrumbs ───────────────────────────────────────────────────────────────

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  }
}

// ── Event ─────────────────────────────────────────────────────────────────────
// City-level location only (addressLocality + city-level region/country; never a
// street/venue/geo point — ADR-186). Google requires `location` and `startDate`.
// For online events we emit a schema.org VirtualLocation pointing at the PUBLIC
// event page (never the members-only join link). Optional B1 enrichment
// (attendance_mode / is_cancelled / category / region / country) drives
// eventAttendanceMode + eventStatus + a richer Place; without it we fall back to
// today's "scheduled, offline" defaults so existing callers keep working.

// The fields layered onto a PublicEvent by app/discover/events/_data.ts. Kept
// structurally typed (not imported) so lib/jsonld stays dependency-light.
type EventSchemaEnrichment = {
  attendance_mode?: 'in_person' | 'online' | 'hybrid' | null
  is_cancelled?: boolean | null
  category?: string | null
  region?: string | null
  country?: string | null
}

const ATTENDANCE_MODE_URL: Record<'in_person' | 'online' | 'hybrid', string> = {
  in_person: 'https://schema.org/OfflineEventAttendanceMode',
  online: 'https://schema.org/OnlineEventAttendanceMode',
  hybrid: 'https://schema.org/MixedEventAttendanceMode',
}

export function eventSchema(event: PublicEvent & EventSchemaEnrichment) {
  const mode: 'in_person' | 'online' | 'hybrid' = event.attendance_mode ?? 'in_person'
  const url = abs(`/discover/events/${event.slug}`)

  // City-level Place: addressLocality + optional city-level region/country. We
  // never include streetAddress, venue name, or coordinates.
  const place = event.city
    ? {
        '@type': 'Place',
        name: event.city,
        address: {
          '@type': 'PostalAddress',
          addressLocality: event.city,
          ...(event.region ? { addressRegion: event.region } : {}),
          ...(event.country ? { addressCountry: event.country } : {}),
        },
      }
    : { '@type': 'Place', name: 'Location shared with members' }

  // VirtualLocation for the online side. The URL is the public event page (where
  // a member signs in to get the real join link), never the members-only
  // online_url — that stays private.
  const virtual = { '@type': 'VirtualLocation', url }

  // Online → VirtualLocation; hybrid → both (schema.org allows an array);
  // in_person → the city-level Place.
  const location =
    mode === 'online' ? virtual : mode === 'hybrid' ? [place, virtual] : place

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.starts_at,
    ...(event.ends_at ? { endDate: event.ends_at } : {}),
    eventStatus: event.is_cancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: ATTENDANCE_MODE_URL[mode],
    // Google lists `image` as required for Event rich results — the per-event
    // dynamic OG image (app/discover/events/[slug]/opengraph-image.tsx), with
    // the site image as a secondary.
    image: [abs(`/discover/events/${event.slug}/opengraph-image`), abs('/opengraph-image')],
    ...(event.description ? { description: event.description } : {}),
    location,
    url,
    ...(event.circle_name
      ? { organizer: { '@type': 'Organization', name: event.circle_name } }
      : {}),
    // Pricing from the public RPC (price_cents; null/0 = free). The offer URL is
    // the public event page — tickets are bought there after sign-in.
    isAccessibleForFree: !(event.price_cents && event.price_cents > 0),
    offers: {
      '@type': 'Offer',
      price: event.price_cents && event.price_cents > 0 ? (event.price_cents / 100).toFixed(2) : '0.00',
      priceCurrency: 'USD',
      availability: event.is_cancelled
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      url,
      validFrom: event.starts_at,
    },
  }
}

// ── ItemList (listings) ───────────────────────────────────────────────────────

export function circleListSchema(circles: PublicCircle[], listName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: circles.length,
    itemListElement: circles.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/discover/circles/${c.id}`),
      name: c.name,
    })),
  }
}

export function eventListSchema(events: PublicEvent[], listName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: events.length,
    itemListElement: events.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/discover/events/${e.slug}`),
      name: e.title,
    })),
  }
}

export function topicListSchema(channels: TopicalChannel[], listName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: channels.length,
    itemListElement: channels.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/discover/topics/${c.slug}`),
      name: c.name,
    })),
  }
}

// ── Journey (HowTo) ───────────────────────────────────────────────────────────
// A published library Journey maps cleanly onto schema.org/HowTo: an ordered set
// of repeatable steps (Practices) that build toward an outcome. HowTo is the
// answer-engine lever for guides (CONTENT-VOICE §8b) — one of the few types AI
// Overviews lift step-by-step. Each step deep-links back to the public Journey
// page; no member data is exposed (steps are the author's public Practice list).

export function journeySchema(plan: JourneyPlan, items: JourneyPlanItem[]) {
  const url = abs(`/discover/journeys/${plan.slug}`)
  // Estimated total time from each step's practice base est_minutes, when known.
  const totalMinutes = items.reduce((sum, it) => {
    return sum + (it.est_minutes ?? it.practice?.est_minutes ?? 0)
  }, 0)

  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: plan.title,
    ...(plan.summary ? { description: plan.summary } : {}),
    image: [abs('/opengraph-image')],
    url,
    ...(totalMinutes > 0 ? { totalTime: `PT${totalMinutes}M` } : {}),
    step: items.map((it, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: it.practice?.title ?? `Step ${i + 1}`,
      text: it.note ?? it.practice?.description ?? it.practice?.title ?? `Step ${i + 1}`,
      url: `${url}#step-${i + 1}`,
    })),
  }
}

// ── ItemList (Journey listing) ────────────────────────────────────────────────

export function journeyListSchema(plans: JourneyPlan[], listName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: plans.length,
    itemListElement: plans.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/discover/journeys/${p.slug}`),
      name: p.title,
    })),
  }
}

// ── Local business (partner) ───────────────────────────────────────────────────
// Partner businesses are PUBLIC by design ("designed to be found" — a Yelp/Facebook-style
// page that can post events and offer member rewards), so unlike Event location (city-level
// only, ADR-186) a partner's full self-provided street address IS published: that's the point.
// LocalBusiness is the local-SEO/AIO lever for "<category> near me" answers.

export function localBusinessSchema(p: {
  name: string
  slug: string
  description?: string | null
  city?: string | null
  address?: string | null
  website?: string | null
}) {
  const url = abs(`/discover/partners/${p.slug}`)
  const hasAddress = !!(p.address || p.city)
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: p.name,
    url,
    image: [abs('/opengraph-image')],
    ...(p.description ? { description: p.description } : {}),
    ...(p.website ? { sameAs: [p.website] } : {}),
    ...(hasAddress
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(p.address ? { streetAddress: p.address } : {}),
            ...(p.city ? { addressLocality: p.city } : {}),
          },
        }
      : {}),
  }
}

export function partnerListSchema(
  partners: { slug: string; name: string }[],
  listName: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: partners.length,
    itemListElement: partners.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/discover/partners/${p.slug}`),
      name: p.name,
    })),
  }
}

// ── Practice (HowTo) ────────────────────────────────────────────────────────────
// A Practice is "one core real-world act" — a how-to. HowTo is the answer-engine lever for
// guides (CONTENT-VOICE §8b), so each public practice page is a crawlable "how to do X".

export function practiceSchema(p: {
  id: string
  slug?: string | null
  title: string
  summary?: string | null
  description?: string | null
  body?: string | null
}) {
  const url = abs(`/discover/practices/${p.slug ?? p.id}`)
  const desc = p.summary ?? p.description ?? undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: p.title,
    ...(desc ? { description: desc } : {}),
    image: [abs('/opengraph-image')],
    url,
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: p.title,
        text: p.body ?? desc ?? p.title,
        url,
      },
    ],
  }
}

export function practiceListSchema(
  practices: { id: string; slug?: string | null; title: string }[],
  listName: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: practices.length,
    itemListElement: practices.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/discover/practices/${p.slug ?? p.id}`),
      name: p.title,
    })),
  }
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

export function faqSchema(qas: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qas.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

// ── Help article ──────────────────────────────────────────────────────────────
// Help-center articles are answer-engine targets for "how do I…" questions.
// Article schema signals an authoritative, dated source so engines (and Google's
// rich results) can cite them. Publisher is the Organization; we keep it lean.

export function articleSchema(article: {
  title: string
  description: string
  path: string
  updated?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: abs(article.path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(article.path) },
    ...(article.updated ? { dateModified: article.updated } : {}),
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: abs('/icons/icon-192.png') },
    },
  }
}

