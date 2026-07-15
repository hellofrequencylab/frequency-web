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
import type { EventsIndexData } from '@/app/(main)/events/index-data'

// EVENTS SURFACE — the ONE Marketplace events composition, rendered at BOTH /events (the member's
// own events home) and /marketplace/events (the Events tab of the commerce hub). It is the same
// hero search bar (instant client filter over the loaded list), the uncarded MarketplaceBar, one
// UnderlineTabs sub-menu (All + event categories) with the density control, an InstantGrid of
// EventCard, and the shared MarketplaceGuide. It reuses the SAME data + card the two routes already
// load (getEventsIndexData + EventCard); no business logic is duplicated. Parameterized by `basePath`
// (the category-tab hrefs, the clear-filters link, the empty-state links) and an optional `actions`
// slot (the member's Add Event / Manage / My drafts cluster on their own /events home; the commerce
// tab passes none). Server component; semantic tokens only, no em or en dashes.

// Coded hero fallback, matching the /events banner when no operator hero is set.
const HERO_FALLBACK = '/images/site/community-dinner.jpg'

// The default hero copy — the marketplace Events tab's framing. /events overrides the title (and
// may override the eyebrow/subtitle) with a keyword-forward, self-canonical H1 for SEO/AIO.
const HERO_DEFAULT_EYEBROW = 'Events'
const HERO_DEFAULT_TITLE = 'Find your next gathering'
const HERO_DEFAULT_SUBTITLE =
  'Paid and free events near you, from community circles and hosts. Search, browse by category, then RSVP or grab a ticket.'

export function EventsSurface({
  data,
  basePath,
  activeCategory,
  actions,
  heroEyebrow = HERO_DEFAULT_EYEBROW,
  heroTitle = HERO_DEFAULT_TITLE,
  heroSubtitle = HERO_DEFAULT_SUBTITLE,
}: {
  data: EventsIndexData
  /** Roots every category-tab href, the clear-filters link, and the empty-state links. */
  basePath: '/events' | '/marketplace/events'
  /** The active category facet value (from the URL), highlighting its tab. */
  activeCategory?: string
  /** The member-actions cluster (Add Event / Manage / My drafts), rendered in the hero. Omit on the
   *  commerce tab, where these host actions do not belong. */
  actions?: React.ReactNode
  /** Hero copy. Defaults to the marketplace framing so /marketplace/events is unchanged; /events
   *  passes a keyword-forward, on-canon H1 (the hero title IS the page H1, MarketHero). */
  heroEyebrow?: string
  heroTitle?: string
  heroSubtitle?: string
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
  } = data

  // Canonical sub-menu: All + one tab per event category, the SAME UnderlineTabs row the other
  // marketplace surfaces use. Built from the category facet; degrades to just "All" when none exist.
  const categoryFacet = facets.find((f) => f.paramKey === 'category')
  const categoryTabs = [
    { href: basePath, label: 'All' },
    ...(categoryFacet?.options ?? []).map((o) => ({
      href: `${basePath}?category=${encodeURIComponent(o.value)}`,
      label: o.label,
    })),
  ]
  const activeCategoryHref = activeCategory
    ? `${basePath}?category=${encodeURIComponent(activeCategory)}`
    : basePath

  const hero = (
    <MarketHero
      image={content.heroImage ?? HERO_FALLBACK}
      eyebrow={heroEyebrow}
      title={heroTitle}
      subtitle={heroSubtitle}
      search={<MarketSearchBar placeholder="Search events" />}
      action={actions}
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
                        href={basePath}
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
