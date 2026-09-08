import { getPublicEventBySlug } from '@/lib/discover'
import { getEventEnrichment } from '../_data'
import { SITE_NAME } from '@/lib/site'
import { eventCardResponse } from '@/lib/og/event-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `An event on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// 🔴 RENDERED ON DEMAND, NOT AT BUILD, AND THAT IS THE POINT OF ADR-1257 — do not delete this line
// to "make the card faster". `page.tsx` beside this file prerenders ~200 upcoming slugs through
// `generateStaticParams`, and a metadata image route inherits that set, so before this change every
// one of those slugs rasterised a FLAT TEXT card during `next build`. Leading with the cover makes
// each of those a photographic raster plus a remote image fetch, and the cost was measured rather
// than argued (2026-09-07, this repo's own pipeline: next/og + sharp q85, 1200x630):
//
//     flat text card    ~88 ms/card    26 KB jpeg
//     cover-led card   ~360 ms/card   139 KB jpeg    steady-state RSS ~400 MB per worker
//
// That is ~+310 ms of raster per slug BEFORE the remote fetch, ~200 slugs, across 3 prerender
// workers on a 4-core / 8 GB builder that already renders ~330 routes — and `LIVE-123` is an OPEN
// row about builds stalling in "Collecting page data" whose leading untested hypothesis is memory
// pressure. Paying that at build time buys nothing a crawler can perceive: `lib/og/deliver.ts` sets
// `s-maxage=86400, stale-while-revalidate=604800`, so the FIRST fetch of a given card renders it
// and every fetch after that is a CDN hit for a day, with a week of instant stale hits behind it.
// The member twin at /events/<slug> has always rendered this way, on the same events.
export const dynamic = 'force-dynamic'

// Per-event dynamic OG image (BUILD-LIST P3) — the share card for /discover/events/[slug] and the
// `image` in the Event JSON-LD. It leads with the event's COVER when there is one and falls back to
// the brand text card when there is not; the layout is the one in lib/og/event-card.tsx, shared with
// the member card at /events/<slug> so the two can never drift (ADR-1179 is what a second copy
// costs). No remote FONT fetch on either branch — the built-in font carries the text card and the
// committed Nunito faces carry the poster card (lib/og/load-nunito.ts).
//
// 🔴 PRIVACY: THIS IS THE PUBLIC SURFACE AND IT GETS TIER 1 ONLY. The member card resolves three
// artwork sources through lib/events/hero-url.ts, two of which live in the PRIVATE poster bucket.
// Those must never reach this card: a scanned flyer routinely carries the venue's street address,
// which this surface deliberately redacts to city level (ADR-186), and the private bucket is not
// anon-readable in the first place. The cover here is `cover_url` from the enrichment — the public
// `event-media` bucket, built with `getPublicUrl` on the ANON client, so RLS is the gate (LIVE-133).
// Same rule for the strings: title, date, city, hosting circle. Never the venue, never the
// members-only join link.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // `.catch(() => null)` mirrors the circles OG card, which has always guarded its read, and the
  // asymmetry mattered: getPublicEventBySlug is a detailRead, so it THROWS, and this route was
  // prerendered for the same ~200 slugs as the page. A share card that already renders a branded
  // fallback for a missing event must not be the thing that ends a production export (LIVE-084).
  // Still true now that the route renders on demand: a throw here is a 500 in front of a crawler.
  //
  // The PAGE deliberately keeps throwing: there, swallowing a read failure would answer a crawler
  // with a genuine 404 on a sitemapped URL and de-index it. An OG image has no such consequence.
  const [event, enrichment] = await Promise.all([
    getPublicEventBySlug(slug).catch(() => null),
    getEventEnrichment(slug),
  ])

  const title = event?.title ?? `An event on ${SITE_NAME}`
  const when = event
    ? new Date(event.starts_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  const where = event?.city ?? null
  const circle = event?.circle_name ?? null
  const mode = enrichment?.attendance_mode ?? 'in_person'
  // A small chip: cancelled wins, then the online/hybrid format flag. In-person
  // events show no chip (it's the unremarkable default).
  const chip = enrichment?.is_cancelled
    ? 'Cancelled'
    : mode === 'online'
      ? 'Online'
      : mode === 'hybrid'
        ? 'In person + online'
        : null

  return eventCardResponse({
    title,
    when,
    where,
    // The text card falls back to "A community gathering" on its own.
    hostLine: circle ? `Hosted by ${circle}` : null,
    chip,
    isCancelled: Boolean(enrichment?.is_cancelled),
    // ⚠️ Gated on `event`, not on the cover alone. When the RPC read found nothing this card is the
    // identity-free fallback, and an identity-free card must not carry the entity's artwork either.
    coverUrl: event ? enrichment?.cover_url : null,
    coverFocus: enrichment?.cover_focus,
  })
}
