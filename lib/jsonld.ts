// ── JSON-LD structured data (AEO) ─────────────────────────────────────────────
// Schema.org builders for answer-engine / rich-result eligibility. Everything
// here respects the same privacy contract as the rest of /discover: Event
// location is CITY-LEVEL ONLY (addressLocality), never a precise venue. When a
// city isn't known we describe the location generically rather than leak it.

import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site'
import type { PublicCircle, PublicEvent, TopicalChannel } from '@/lib/discover'

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
    email: 'hello@findafreq.com',
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
// City-level location only. Past events are marked EventScheduled still, but we
// keep the data honest with start/end. Google requires `location` and
// `startDate`; we provide a Place with addressLocality (city) or a generic
// placeholder so we never omit the field nor expose the venue.

export function eventSchema(event: PublicEvent) {
  const location = event.city
    ? {
        '@type': 'Place',
        name: event.city,
        address: { '@type': 'PostalAddress', addressLocality: event.city },
      }
    : {
        '@type': 'Place',
        name: 'Location shared with members',
      }

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.starts_at,
    ...(event.ends_at ? { endDate: event.ends_at } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.description ? { description: event.description } : {}),
    location,
    url: abs(`/discover/events/${event.slug}`),
    ...(event.circle_name
      ? { organizer: { '@type': 'Organization', name: event.circle_name } }
      : {}),
    isAccessibleForFree: true,
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
