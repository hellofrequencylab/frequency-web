import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { EventCard } from '@/components/events/event-card'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchProvider, MarketSearchBar, InstantGrid } from '@/components/marketplace/market-search'
import { MarketplaceBar } from '@/components/marketplace/marketplace-bar'
import { MarketplaceGuide } from '@/components/marketplace/marketplace-guide'
import {
  MarketplaceColumnsProvider,
  MarketplaceColumns,
} from '@/components/marketplace/column-selector'
import { getEventsIndexData } from '@/app/(main)/events/index-data'

// EVENTS — the Marketplace's events surface (Classifieds · Housing · Market · Events ·
// Frequency Store, ADR-596). It reuses the SAME data + card the /events Catalog runs on
// (getEventsIndexData + EventCard), reframed in the shared marketplace chrome so it reads
// exactly like the other four areas: a hero search bar (instant client filter over the loaded
// list), the uncarded MarketplaceBar, and one UnderlineTabs sub-menu (All + event categories)
// with the density control folded into its right side. Both paid and free events list here.
// No business logic is duplicated. No em or en dashes.

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
  const sp = await searchParams
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
  } = await getEventsIndexData(sp)

  // Canonical sub-menu: All + one tab per event category, the SAME UnderlineTabs row the other
  // marketplace surfaces use (Classifieds kinds, Market groups, Housing property types). Built from
  // the category facet; if no categories are present it degrades to just "All".
  const categoryFacet = facets.find((f) => f.paramKey === 'category')
  const categoryTabs = [
    { href: '/marketplace/events', label: 'All' },
    ...(categoryFacet?.options ?? []).map((o) => ({
      href: `/marketplace/events?category=${encodeURIComponent(o.value)}`,
      label: o.label,
    })),
  ]
  const activeCategoryHref = sp.category
    ? `/marketplace/events?category=${encodeURIComponent(sp.category)}`
    : '/marketplace/events'

  const hero = (
    <MarketHero
      image={content.heroImage ?? HERO_FALLBACK}
      eyebrow="Events"
      title="Find your next gathering"
      subtitle="Paid and free events near you, from community circles and hosts. Search, browse by category, then RSVP or grab a ticket."
      search={<MarketSearchBar placeholder="Search events" />}
    />
  )

  return (
    <MarketSearchProvider>
      <div className="space-y-6">
        {hero}

        <div className="space-y-5">
          <MarketplaceBar
            active="events"
            stats={[{ label: 'Upcoming', value: sortedEvents.length, icon: CalendarDays }]}
          />

          <MarketplaceColumnsProvider className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <UnderlineTabs tabs={categoryTabs} activeHref={activeCategoryHref} />
              <MarketplaceColumns />
            </div>

            <div className="@container">
              {sortedEvents.length === 0 ? (
                filtering ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No events match these filters"
                    description="Try another category or clear the filter to see everything coming up."
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
                <InstantGrid
                  items={sortedEvents.map((e) => ({ text: `${e.title} ${e.location ?? ''}` }))}
                  className="mp-grid gap-4"
                >
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
                </InstantGrid>
              )}
            </div>
          </MarketplaceColumnsProvider>
        </div>

        <MarketplaceGuide />
      </div>
    </MarketSearchProvider>
  )
}
