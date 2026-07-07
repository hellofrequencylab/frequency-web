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

// The site-wide Organization node (emitted once in the root layout). Optional
// enrichment is ADDITIVE and backward-compatible: existing callers keep the lean
// node, while passing `sameAs` (canonical social/entity profiles) and/or
// `foundingLocation` (the city the community is rooted in) gives answer engines
// the extra identity edges they use to resolve "Frequency" as a real entity in
// the knowledge graph, a primary AIO lever (CONTENT-VOICE §8). No precise
// address is ever emitted: foundingLocation is a city-level Place only.
export function organizationSchema(opts?: {
  /** Canonical profiles for entity disambiguation (e.g. social URLs). */
  sameAs?: string[]
  /** City the community is rooted in (city-level Place, never a street). */
  foundingLocation?: string | null
}) {
  const sameAs = opts?.sameAs?.filter(Boolean) ?? []
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: abs('/icons/icon-192.png'),
    description: SITE_DESCRIPTION,
    email: 'hello@frequencylocal.com',
    ...(sameAs.length ? { sameAs } : {}),
    ...(opts?.foundingLocation
      ? {
          foundingLocation: {
            '@type': 'Place',
            name: opts.foundingLocation,
            address: { '@type': 'PostalAddress', addressLocality: opts.foundingLocation },
          },
        }
      : {}),
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

// ── Circle (Organization) ─────────────────────────────────────────────────────
// A circle is a small standing LOCAL GROUP, so it maps to schema.org/Organization
// (the closest valid type — no "meetup group" exists). Only fields the public page
// already loads are emitted; the member count is NEVER fabricated, and the location
// stays CITY-LEVEL (addressLocality), same privacy contract as the rest of /discover.
// Mirrors the inline node the circle detail page used to carry, now a tested helper
// so it can't drift from the other entity schemas.
export function circleSchema(c: {
  id: string
  name: string
  about?: string | null
  city?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: c.name,
    url: abs(`/discover/circles/${c.id}`),
    ...(c.about ? { description: c.about } : {}),
    ...(c.city
      ? {
          location: {
            '@type': 'Place',
            address: { '@type': 'PostalAddress', addressLocality: c.city },
          },
        }
      : {}),
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
  // Estimated total time from each step's own est_minutes, when known (lives on the item, not the
  // embedded practice — see ITEM_COLS in lib/journey-plans.ts).
  const totalMinutes = items.reduce((sum, it) => {
    return sum + (it.est_minutes ?? 0)
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

// ── Person ────────────────────────────────────────────────────────────────────
// A public profile of a real person (an event organizer/host, a practitioner). schema.org/Person
// gives an answer engine an identity node for "who hosts X" / "who runs Y". Name + canonical url +
// optional avatar image only, no email, no member data.

export function personSchema(p: { name: string; path: string; image?: string | null }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    url: abs(p.path),
    ...(p.image ? { image: p.image } : {}),
  }
}

// ── Space (entity profile) ──────────────────────────────────────────────────────
// A networked entity Space (/spaces/<slug>) is a PUBLIC profile by design (visibility = 'network'),
// so it is a real schema.org node, not a city-redacted one. After the ADR-552 type collapse there are
// two public types: a `business` (whatever its free Focus, place-based or not) maps to LocalBusiness,
// and a `nonprofit` maps to a plain Organization. The @type maps off the Space's type so an answer
// engine knows what kind of thing it is. NETWORK spaces only: a Private space never reaches this
// builder (the page emits noindex and omits the schema). Brand name + tagline only; no member data.

/** The @type a Space's type maps to: `business` is a place-based LocalBusiness; `nonprofit` (and any
 *  unknown/internal host like `root`) is a plain Organization, so the node is never blank. */
function spaceSchemaType(type: string): 'LocalBusiness' | 'Organization' {
  if (type === 'business') return 'LocalBusiness'
  return 'Organization'
}

/** The optional, backward-compatible superset input for spaceSchema. Every field beyond the base
 *  four is OPTIONAL and emitted only when present, so existing callers are unchanged. This is the
 *  single place the LocalBusiness/Organization node is shaped; callers PASS values (reviews ->
 *  aggregateRating, socials -> sameAs, etc.) as sources land, never re-declare the signature. */
export interface SpaceSchemaInput {
  slug: string
  type: string
  name: string
  tagline?: string | null
  logoUrl?: string | null
  /** Social / profile URLs that identify this same entity (entity resolution + AIO citation). */
  sameAs?: readonly (string | null | undefined)[] | null
  telephone?: string | null
  /** A relative price indicator, e.g. '$' or '$$'. */
  priceRange?: string | null
  address?: {
    streetAddress?: string | null
    addressLocality?: string | null
    addressRegion?: string | null
    postalCode?: string | null
    addressCountry?: string | null
  } | null
  geo?: { latitude: number; longitude: number } | null
  /** schema.org openingHours strings, e.g. 'Mo-Fr 09:00-17:00'. */
  openingHours?: readonly (string | null | undefined)[] | null
  /** A place or region served (for services without a storefront). */
  areaServed?: string | null
  /** Emitted ONLY when reviewCount > 0. Never emit a null/zero rating: answer engines silently drop
   *  malformed schema, which would negate the SEO investment. */
  aggregateRating?: { ratingValue: number; reviewCount: number } | null
}

/** Drop null/empty/whitespace entries from an optional string list. */
function cleanStrings(list: readonly (string | null | undefined)[] | null | undefined): string[] {
  return (list ?? []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
}

/** A schema.org PostalAddress from the present sub-fields, or null when none are set. */
function postalAddress(a: SpaceSchemaInput['address']) {
  if (!a) return null
  const entries = Object.entries({
    streetAddress: a.streetAddress,
    addressLocality: a.addressLocality,
    addressRegion: a.addressRegion,
    postalCode: a.postalCode,
    addressCountry: a.addressCountry,
  }).filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
  if (entries.length === 0) return null
  return { '@type': 'PostalAddress', ...Object.fromEntries(entries) }
}

export function spaceSchema(space: SpaceSchemaInput) {
  const url = abs(`/spaces/${space.slug}`)
  const ogImage = abs(`/spaces/${space.slug}/opengraph-image`)
  // The operator's own logo (an arbitrary URL) is the primary image when set, then the per-Space OG
  // card, then the site image as a final fallback, so the node always has an image (rich-result bar).
  const image = [...(space.logoUrl ? [space.logoUrl] : []), ogImage, abs('/opengraph-image')]

  const sameAs = cleanStrings(space.sameAs)
  const openingHours = cleanStrings(space.openingHours)
  const address = postalAddress(space.address)
  const geo =
    space.geo && Number.isFinite(space.geo.latitude) && Number.isFinite(space.geo.longitude)
      ? { '@type': 'GeoCoordinates', latitude: space.geo.latitude, longitude: space.geo.longitude }
      : null
  const rating =
    space.aggregateRating && space.aggregateRating.reviewCount > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: space.aggregateRating.ratingValue,
          reviewCount: space.aggregateRating.reviewCount,
        }
      : null

  return {
    '@context': 'https://schema.org',
    '@type': spaceSchemaType(space.type),
    // A stable entity URI so search + answer engines resolve the Space as one entity across the
    // network profile and any future custom domain (AIO).
    '@id': url,
    name: space.name,
    url,
    image,
    ...(space.tagline ? { description: space.tagline } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(space.telephone ? { telephone: space.telephone } : {}),
    ...(space.priceRange ? { priceRange: space.priceRange } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(openingHours.length ? { openingHours } : {}),
    ...(space.areaServed ? { areaServed: space.areaServed } : {}),
    ...(rating ? { aggregateRating: rating } : {}),
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

/** An ItemList of Space profiles, for a directory / programmatic hub page (SEO). Each item points at
 *  the Space's public profile so an answer engine can walk the list to the entity nodes. */
export function spaceListSchema(spaces: { slug: string; name: string }[], listName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: spaces.length,
    itemListElement: spaces.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/spaces/${s.slug}`),
      name: s.name,
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
  /** When the article was first published (ISO). Emits datePublished. */
  published?: string | null
  /** When the article was last updated (ISO). Emits dateModified. */
  updated?: string | null
  /** One or more image URLs (absolute, or root-relative — normalized via abs). */
  image?: string | string[] | null
}) {
  const images = article.image
    ? (Array.isArray(article.image) ? article.image : [article.image]).map((src) =>
        src.startsWith('http') ? src : abs(src),
      )
    : undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: abs(article.path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(article.path) },
    ...(article.published ? { datePublished: article.published } : {}),
    ...(article.updated ? { dateModified: article.updated } : {}),
    ...(images ? { image: images } : {}),
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: abs('/icons/icon-192.png') },
    },
  }
}

// ── HowTo (generic guide) ───────────────────────────────────────────────────────
// The general-purpose schema.org/HowTo builder for any step-by-step guide (a
// "how to do X" article or pillar page). HowTo is the answer-engine lever AI
// Overviews lift step by step (CONTENT-VOICE §8b). journeySchema and
// practiceSchema build HowTos from specific game objects; this one takes a plain
// name + description + ordered steps for editorial guides. Each step is a
// HowToStep with a name and text; an optional per-step url deep-links it.

export function howToSchema(howTo: {
  name: string
  description?: string | null
  /** One or more image URLs (absolute, or root-relative — normalized via abs). */
  image?: string | string[] | null
  /** ISO 8601 duration for the whole guide, e.g. "PT15M". */
  totalTime?: string | null
  steps: { name: string; text: string; url?: string | null }[]
}) {
  const images = howTo.image
    ? (Array.isArray(howTo.image) ? howTo.image : [howTo.image]).map((src) =>
        src.startsWith('http') ? src : abs(src),
      )
    : [abs('/opengraph-image')]
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: howTo.name,
    ...(howTo.description ? { description: howTo.description } : {}),
    image: images,
    ...(howTo.totalTime ? { totalTime: howTo.totalTime } : {}),
    step: howTo.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(s.url ? { url: s.url } : {}),
    })),
  }
}

// ── Product / Offer (maker, shop, Space storefront) ─────────────────────────────
// One crawlable Product per sellable item — the AEO node an answer engine cites for
// "where can I buy X". Price in major units, 2dp, currency upper-cased (mirrors Event).

export function productSchema(p: {
  title: string
  description?: string | null
  image?: string | null
  priceCents: number
  currency?: string | null
  inStock?: boolean
  sellerName?: string | null
  /** Canonical app path, e.g. `/shop/tote` or `/marketplace/makers/<id>`. */
  path: string
}) {
  const url = abs(p.path)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    ...(p.description ? { description: p.description } : {}),
    image: [...(p.image ? [p.image] : []), abs('/opengraph-image')],
    url,
    ...(p.sellerName ? { brand: { '@type': 'Brand', name: p.sellerName } } : {}),
    offers: {
      '@type': 'Offer',
      price: (p.priceCents / 100).toFixed(2),
      priceCurrency: (p.currency ?? 'usd').toUpperCase(),
      availability: p.inStock === false ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      url,
      ...(p.sellerName ? { seller: { '@type': 'Organization', name: p.sellerName } } : {}),
    },
  }
}

export function productListSchema(products: { title: string; path: string }[], listName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(p.path),
      name: p.title,
    })),
  }
}

// ── Housing (Accommodation) ─────────────────────────────────────────────────────
// A rental/roommate listing as schema.org/Accommodation. CITY-LEVEL location only
// (addressLocality), never street/coords — same privacy contract as Event (ADR-186).

const ROOM_TYPE_SCHEMA: Record<string, string> = {
  private_room: 'Room',
  shared_room: 'Room',
  entire_place: 'Apartment',
}

export function housingListingSchema(h: {
  title: string
  description?: string | null
  image?: string | null
  city?: string | null
  rentCents?: number | null
  bedrooms?: number | null
  roomType?: string | null
  /** Canonical app path, e.g. `/marketplace/housing/<id>`. */
  path: string
}) {
  const url = abs(h.path)
  return {
    '@context': 'https://schema.org',
    '@type': h.roomType ? ROOM_TYPE_SCHEMA[h.roomType] ?? 'Accommodation' : 'Accommodation',
    name: h.title,
    ...(h.description ? { description: h.description } : {}),
    image: [...(h.image ? [h.image] : []), abs('/opengraph-image')],
    url,
    ...(typeof h.bedrooms === 'number' ? { numberOfBedrooms: h.bedrooms } : {}),
    ...(h.city
      ? { address: { '@type': 'PostalAddress', addressLocality: h.city } }
      : { address: { '@type': 'PostalAddress', addressLocality: 'Shared with members' } }),
    ...(h.rentCents && h.rentCents > 0
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'USD',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: (h.rentCents / 100).toFixed(2),
              priceCurrency: 'USD',
              unitCode: 'MON',
            },
            url,
          },
        }
      : {}),
  }
}

