import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { EventCard } from '@/components/events/event-card'
import { EventsFilterBar } from '@/app/(main)/events/events-filter-bar'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketplaceFacets } from '@/components/marketplace/facet-nav'
import { MarketplaceGuide } from '@/components/marketplace/marketplace-guide'
import {
  MarketplaceColumnsProvider,
  MarketplaceColumns,
} from '@/components/marketplace/column-selector'
import { getEventsIndexData } from '@/app/(main)/events/index-data'

// EVENTS — the Marketplace's events surface (Classifieds · Housing · Market · Events ·
// Frequency Store, ADR-596). It reuses the SAME data + card the /events Catalog runs on
// (getEventsIndexData + EventCard), just reframed in the commerce chrome so it reads as one
// of the five marketplace areas. Both paid and free events list here; the price stat comes
// from the loader's "Free" / "$X" / "From $X" label (cheapest active ticket tier). No business
// logic is duplicated. No em or en dashes.

export const metadata = {
  title: 'Events',
  description: 'Find paid and free events near you, from community circles and hosts.',
}

// Coded hero fallback, matching the /events Catalog banner when no operator hero is set.
const HERO_FALLBACK = '/images/site/community-dinner.jpg'

export default async function MarketplaceEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    format?: string
    date?: string
    price?: string
    energy?: string
    spots?: string
    near?: string
    sort?: string
  }>
}) {
  const {
    content,
    nowDate,
    sortedEvents,
    circleNames,
    coverUrls,
    rsvpCounts,
    priceLabels,
    filtering,
    facets,
    sortOptions,
  } = await getEventsIndexData(await searchParams)

  const hero = (
    <MarketHero
      image={content.heroImage ?? HERO_FALLBACK}
      eyebrow="Events"
      title="Find your next gathering"
      subtitle="Paid and free events near you, from community circles and hosts. Filter by what fits, then RSVP or grab a ticket."
    />
  )

  return (
    <div className="space-y-8">
      {hero}

      <div className="space-y-6">
        <MarketplaceFacets active="events" />

        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <StatCard size="sm" label="Upcoming" value={sortedEvents.length} icon={CalendarDays} />
        </div>

        {/* Honest one-liner (voice canon): what this surface is, plainly. */}
        <p className="max-w-2xl text-sm text-muted">
          Every upcoming event in one place, paid and free. Sort by soonest, most going, or nearest,
          and filter by category, date, or price.
        </p>

        {/* The Catalog toolbar, reused verbatim: URL-driven search + facets + sort, so the view
            stays shareable and does the SAME filtering as the /events Catalog. */}
        <EventsFilterBar facets={facets} sortOptions={sortOptions} />

        {sortedEvents.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={CalendarDays}
              title="No events match these filters"
              description="Try a wider date or clear a filter to see everything coming up."
              action={
                <Link
                  href="/marketplace/events"
                  className="text-sm font-semibold text-primary-strong hover:underline"
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={CalendarDays}
              variant="first-use"
              title="Nothing on the calendar yet"
              description="When your circles or hosts nearby plan something, paid or free, it shows up here."
            />
          )
        ) : (
          <MarketplaceColumnsProvider>
            <div className="mb-4 flex justify-end">
              <MarketplaceColumns />
            </div>
            <div className="@container">
              <div className="mp-grid gap-4">
                {sortedEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    circleName={circleNames[event.scope_id]}
                    coverUrl={coverUrls[event.id]}
                    going={rsvpCounts[event.id] ?? 0}
                    priceLabel={priceLabels[event.id] ?? 'Free'}
                    now={nowDate}
                  />
                ))}
              </div>
            </div>
          </MarketplaceColumnsProvider>
        )}
      </div>

      <MarketplaceGuide />
    </div>
  )
}
