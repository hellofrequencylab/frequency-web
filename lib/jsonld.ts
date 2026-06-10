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
    // Google lists `image` as required for Event rich results — the per-event
    // dynamic OG image (app/discover/events/[slug]/opengraph-image.tsx), with
    // the site image as a secondary.
    image: [abs(`/discover/events/${event.slug}/opengraph-image`), abs('/opengraph-image')],
    ...(event.description ? { description: event.description } : {}),
    location,
    url: abs(`/discover/events/${event.slug}`),
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
      availability: 'https://schema.org/InStock',
      url: abs(`/discover/events/${event.slug}`),
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
  // Estimated total time from the default (Adept) tier of each step, when known.
  const totalMinutes = items.reduce((sum, it) => {
    const tiers = it.practice?.tiers ?? []
    const tier = tiers.find((t) => t.tier === 'adept') ?? tiers[0]
    return sum + (tier?.est_minutes ?? 0)
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

