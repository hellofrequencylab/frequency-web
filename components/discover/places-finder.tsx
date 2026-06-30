'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Users, CalendarDays, MapPin, Search } from 'lucide-react'
import { Card } from '@/components/marketing/marketing-ui'
import { BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

// One town as the index needs it — display name, slug, and the two activity counts.
export type FinderCity = {
  city: string
  slug: string
  circleCount: number
  eventCount: number
}

// Client-side town finder for /discover/places. The whole city list is already in
// the DOM (server-rendered for SEO + crawlers); this just adds an instant filter
// over it so a visitor on a high-intent local search can jump straight to their
// town instead of scanning a long grid. No data fetching, no new server work —
// purely a conversion aid layered on the existing list.
export function PlacesFinder({ cities }: { cities: FinderCity[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cities
    return cities.filter((c) => c.city.toLowerCase().includes(q))
  }, [cities, query])

  return (
    <div>
      {/* Filter box — only worth showing once there are enough towns to scan. */}
      {cities.length > 6 && (
        <div className="mx-auto mb-8 max-w-md">
          <label htmlFor="places-finder" className="sr-only">
            Find your town
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            />
            <input
              id="places-finder"
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find your town…"
              className="w-full rounded-2xl border border-border bg-surface py-3 pl-11 pr-4 text-base text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}

      {filtered.length > 0 ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <li key={c.slug}>
              <Link href={`/discover/places/${c.slug}`} className="group block h-full">
                <Card
                  tone="feature"
                  className="flex h-full flex-col transition-colors hover:border-border-strong"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary-strong" />
                    <h3 className="text-base font-bold text-text transition-colors group-hover:text-primary-strong">
                      {c.city}
                    </h3>
                  </div>
                  <div className="mt-auto flex items-center gap-4 text-xs text-subtle">
                    {c.circleCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {c.circleCount} {c.circleCount === 1 ? 'Circle' : 'Circles'}
                      </span>
                    )}
                    {c.eventCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {c.eventCount} {c.eventCount === 1 ? 'event' : 'events'}
                      </span>
                    )}
                    <ArrowRight className="ml-auto h-4 w-4 text-primary-strong opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-marketing-canvas p-8 text-center">
          <p className="mb-1 text-base font-semibold text-text">
            No towns matching &ldquo;{query.trim()}&rdquo; yet.
          </p>
          <p className="mb-5 text-sm leading-relaxed text-muted">
            Frequency grows one neighborhood at a time. Be the one who starts the first Circle where you live.
          </p>
          <Link
            href={BETA_CTA_HREF}
            className="text-emboss inline-flex items-center justify-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-pop transition-colors hover:bg-primary-hover"
          >
            {BETA_CTA_LABEL} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
