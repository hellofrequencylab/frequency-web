import { getDensityCity, cityFromSlug } from '../_data'
import { SITE_NAME } from '@/lib/site'
import { cardResponse } from '@/lib/og/deliver'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `A city on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-city dynamic OG card for the density-gated city hubs at /discover/cities/[citySlug]
// (SCAN-202): sitemapped, self-canonical landing pages that were sharing the generic brand card.
// Visual language mirrors app/discover/partners/[slug]/opengraph-image.tsx: near-black gradient
// ground, indigo brand bar (#6366f1 — Satori has no access to the CSS token system, so the literal
// mirrors the root image), white display type.
//
// Reads the SAME reader the page reads (getDensityCity), so no new query shape enters the graph
// and the card can never advertise a count the page does not show. City-level facts only — the
// name and the two counts the page's own "At a glance" stats render, never a neighborhood, venue
// or geo point.

export default async function Image({ params }: { params: Promise<{ citySlug: string }> }) {
  const { citySlug } = await params
  // `.catch(() => null)` for the same reason the discover event card guards its read: the page
  // MUST keep throwing (a swallowed failure there would answer a crawler with a soft 404 on a
  // sitemapped URL), but a share card that already renders a branded fallback for a below-threshold
  // city must never be the thing that ends a production export (LIVE-084).
  const hub = await getDensityCity(citySlug).catch(() => null)

  // A below-threshold city 404s on the page, so this card is only ever fetched for a real hub —
  // except during a read failure, where the slug still yields an honest city name.
  const city = hub?.city ?? cityFromSlug(citySlug)
  const isFallback = !hub
  const circles = hub?.circles.length ?? 0
  const events = hub?.events.length ?? 0
  // Same singular/plural wording the page's Stat pair renders.
  const counts = hub
    ? [
        `${circles} ${circles === 1 ? 'Circle' : 'Circles'}`,
        `${events} upcoming ${events === 1 ? 'event' : 'events'}`,
      ].join(' · ')
    : null

  return cardResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundImage: 'linear-gradient(180deg, rgba(13,13,18,1) 0%, rgba(23,21,38,1) 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.32em',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {SITE_NAME.toUpperCase()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              marginBottom: 20,
              padding: '8px 18px',
              borderRadius: 9999,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: '#c7d2fe',
              backgroundColor: 'rgba(99,102,241,0.22)',
            }}
          >
            Find your people
          </div>
          <div
            style={{
              width: 84,
              height: 8,
              borderRadius: 9999,
              backgroundColor: '#6366f1',
              marginBottom: 28,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: city.length > 60 ? 52 : 68,
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              maxWidth: 1000,
            }}
          >
            {city.length > 110 ? `${city.slice(0, 107)}…` : city}
          </div>
          {counts && (
            <div
              style={{
                display: 'flex',
                fontSize: 30,
                marginTop: 22,
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              {counts}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          {isFallback
            ? `Local Circles and events on ${SITE_NAME}`
            : `Circles and real-world events in ${city}`}
        </div>
      </div>
    ),
    size,
  )
}
