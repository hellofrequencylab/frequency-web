import Link from 'next/link'
import { Suspense } from 'react'
import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { EventCard } from '@/components/events/event-card'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { MarketHero } from '@/components/marketplace/market-hero'
import { MarketSearchProvider, MarketSearchBar, InstantGrid } from '@/components/marketplace/market-search'
import { MarketplaceBar } from '@/components/marketplace/marketplace-bar'
import { MarketplaceGuide } from '@/components/marketplace/marketplace-guide'
import {
  MarketplaceColumnsProvider,
  MarketplaceColumns,
} from '@/components/marketplace/column-selector'
import { EventsMapToggle } from '@/components/events/events-map-client'
import { EventsForYou } from '@/components/events/events-for-you'
import { EventConnectors } from '@/components/events/event-connectors'
import type { EventsIndexData } from '@/app/(main)/events/index-data'
import { resolveMarketHero } from '@/lib/layout/index-hero'

// EVENTS SURFACE — the ONE events composition, rendered at /events (the member's events home and
// the commerce hub's Events tab in one; the duplicate /marketplace/events twin was retired by
// ADR-866 and 308-redirects here). It is the hero search bar (instant client filter over the
// loaded list), the uncarded MarketplaceBar, one UnderlineTabs sub-menu (All + event categories)
// with the density control, an InstantGrid of EventCard, and the shared MarketplaceGuide. It
// reuses the SAME data + card the route already loads (getEventsIndexData + EventCard); no
// business logic is duplicated. Parameterized by `basePath` (the category-tab hrefs, the
// clear-filters link, the empty-state links) and an optional `actions` slot (the member's Add
// Event / Manage / My drafts cluster). Server component; semantic tokens only, no em or en dashes.

// Coded hero fallback, matching the /events banner when no operator hero is set.
const HERO_FALLBACK = '/images/site/community-dinner.jpg'

// The default hero copy. "Events near you" is the keyword-forward H1 (the phrase people actually
// search, EVENTS AIO / CONTENT-VOICE §8a): the hero title IS the page H1 (MarketHero), and /events
// is the one canonical events URL (ADR-866).
const HERO_DEFAULT_EYEBROW = 'Events'
const HERO_DEFAULT_TITLE = 'Events near you'
const HERO_DEFAULT_SUBTITLE =
  'Paid and free events near you, from community circles and hosts. Search, browse by category, then RSVP or grab a ticket.'

export async function EventsSurface({
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
  basePath: '/events'
  /** The active category facet value (from the URL), highlighting its tab. */
  activeCategory?: string
  /** The member-actions cluster (Add Event / Manage / My drafts), rendered in the hero. Omit on the
   *  commerce tab, where these host actions do not belong. */
  actions?: React.ReactNode
  /** Hero copy. Defaults to the keyword-forward, on-canon H1 (the hero title IS the page H1,
   *  MarketHero). */
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
    coverFocus,
    rsvpCounts,
    priceLabels,
    filtering,
    facets,
    mapPins,
    showForYou,
    myProfileId,
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

  // The whole hero band through the ONE browse-hero ladder (lib/layout/index-hero, PROG-P4): the
  // operator's Settings header image for `basePath`, then the page_content hero the index data
  // already resolved, then the coded cover, plus the operator-tunable header element (ADR-793) for
  // layout / height / scrim. It used to read the element alone, so an operator who uploaded a
  // header image for /events got nothing. `basePath` is typed to the one canonical events route.
  const heroBand = await resolveMarketHero(basePath, { cover: HERO_FALLBACK, contentImage: content.heroImage })

  const hero = (
    <MarketHero
      {...heroBand}
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

            {/* The personalized lanes (Events B-4). Both are slow — embedding scoring, an AI blurb,
                a connector query — so each streams behind its OWN <Suspense> and neither can delay
                the shell, the stats, or the list below (PAGE-FRAMEWORK §5). `showForYou` is the
                gate index-data already computed: signed in, no facet active, more than one event. */}
            {showForYou && myProfileId ? (
              <div className="space-y-6">
                <Suspense fallback={null}>
                  <EventsForYou
                    viewerProfileId={myProfileId}
                    events={sortedEvents}
                    circleNames={circleNames}
                    coverUrls={coverUrls}
                    coverFocus={coverFocus}
                    rsvpCounts={rsvpCounts}
                    priceLabels={priceLabels}
                    nowDate={nowDate}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <EventConnectors
                    viewerProfileId={myProfileId}
                    eventIds={sortedEvents.map((e) => e.id)}
                  />
                </Suspense>
              </div>
            ) : null}

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
                        className="text-body-sm font-semibold text-primary-strong hover:underline"
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
                <EventsMapToggle pins={mapPins}>
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
                      coverFocus={coverFocus[event.id]}
                      going={rsvpCounts[event.id] ?? 0}
                      priceLabel={priceLabels[event.id] ?? 'Free'}
                      now={nowDate}
                    />
                  ))}
                </InstantGrid>
                </EventsMapToggle>
              )}
            </div>
          </MarketplaceColumnsProvider>
        </div>

        <MarketplaceGuide />
      </div>
    </MarketSearchProvider>
  )
}
