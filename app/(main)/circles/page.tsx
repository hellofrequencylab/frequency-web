import Link from 'next/link'
import { Users, Compass, Sparkles } from 'lucide-react'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { MapZone, MapPreview, MapBanner, FindNearMeButton } from '@/components/circles/circles-map'
import { IndexTemplate } from '@/components/templates'
import { PageContents } from '@/components/templates/page-contents'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard } from '@/components/circles/circle-card'
import { CirclesToolbar } from '@/components/circles/circles-toolbar'
import { pageContentMetadata } from '@/lib/page-content'
import { getCirclesIndexData, CONTENT_FALLBACK } from '@/lib/circles/index-data'

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/circles', CONTENT_FALLBACK)
}

export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; interest?: string; sort?: string; q?: string; channel?: string }>
}) {
  const {
    content,
    signedIn,
    interests,
    channelLinks,
    cards,
    myCircleIds,
    locatable,
    starterSeeds,
    showMap,
    nearlyFullCount,
    hitFetchCap,
    fetchLimit,
    filtering,
    interestChips,
    nexuses,
    selectedInterest,
  } = await getCirclesIndexData(await searchParams)

  return (
    <IndexTemplate
      title={content.title}
      action={
        signedIn || (content.ctaLabel && content.ctaHref) ? (
          <div className="flex items-center gap-2">
            {signedIn && (
              <NewCircleCompose
                interests={interests}
                buttonLabel="Start a circle"
                buttonClass="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              />
            )}
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {content.ctaLabel && content.ctaHref && (
              <a
                href={content.ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {content.ctaLabel}
              </a>
            )}
          </div>
        ) : undefined
      }
      description={
        <>
          {/* Mobile leads with a tight one-liner so the stats + actions surface
              without scrolling past a wall of copy; desktop keeps the operator-
              editable full pitch. */}
          <span className="sm:hidden">Find a circle near you, or start your own.</span>
          <span className="hidden sm:inline">{content.description}</span>
        </>
      }
    >
      {/* Operator-set hero banner (PX.1) — renders only when set. */}
      {content.heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.heroImage}
          alt=""
          className="mb-6 h-44 w-full rounded-2xl border border-border object-cover sm:h-56"
        />
      )}

      {/* Table of contents — filter circles by Channel. Counts ride quietly on each
          chip (gamified-stat law: member/city counts are inline context, never KPI
          tiles — MEMBER-DESIGN-SYSTEM §2). */}
      <PageContents links={channelLinks} divider={false} />

      <MapZone circles={locatable} starterSeeds={starterSeeds}>
        {/* Find-near-me opens the map; the stats moved up beside the filter menu and
            "Start a circle" lives in the page header now. */}
        {showMap && (
          <div className="mb-6">
            <FindNearMeButton />
          </div>
        )}

        {/* Flywheel nudge — when circles are filling up, invite the next host. */}
        {signedIn && nearlyFullCount > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-bg bg-primary-bg/40 p-4 dark:bg-primary-bg/15">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">
                  {nearlyFullCount} {nearlyFullCount === 1 ? 'circle is' : 'circles are'} filling up
                </p>
                <p className="text-sm text-muted">
                  A full circle is a good problem. It means the next one&rsquo;s ready to start. Open the
                  door for the people still looking for their room.
                </p>
              </div>
            </div>
            <NewCircleCompose
              interests={interests}
              buttonLabel="Start the next circle"
              buttonClass="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            />
          </div>
        )}

        <CirclesToolbar interests={interests} />

        {/* Cap notice — only shown when the fetch hit the safety limit. */}
        {hitFetchCap && (
          <p className="mt-3 text-xs text-subtle">
            Showing the first {fetchLimit} Circles. Use the filters above to find what you&rsquo;re looking for.
          </p>
        )}

        {/* Expanded map — opens above the grid (the Find-near-me button opens it). */}
        <div className="mt-6">
          <MapBanner />
        </div>

        {/* Two columns: circles flow on the left; the browse nav sits in a STABLE
            right column so it's never orphaned at the bottom. The map leads the
            left column when there are locatable circles. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          {/* Left — map (when present) over the circle grid */}
          <div className="min-w-0 space-y-6">
            {showMap && (
              <div className="h-72">
                <MapPreview />
              </div>
            )}

            {cards.length === 0 ? (
              <EmptyState
                icon={Users}
                title={filtering ? 'No circles match these filters' : 'No circles yet'}
                description={
                  filtering
                    ? 'Try a wider search, or start the first one for this corner of the network.'
                    : 'Be the first to start a circle for your neighborhood or a Channel.'
                }
                action={signedIn ? <NewCircleCompose interests={interests} buttonLabel="Start a circle" /> : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {cards.map((card) => (
                  <CircleCard key={card.id} circle={card} isMember={myCircleIds.includes(card.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Right — the browse nav, pinned at the top of its column */}
          <aside className="space-y-6">
            {interestChips.length > 0 && (
              <div>
                <SectionHeader title="Browse by Channel" />
                <div className="space-y-0.5">
                  {interestChips.map((i) => {
                    const active = selectedInterest === i.id
                    return (
                      <Link
                        key={i.id}
                        href={`/circles?interest=${active ? '' : i.id}`}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                          active
                            ? 'bg-primary-bg font-semibold text-primary-strong'
                            : 'text-muted hover:bg-surface-elevated hover:text-text'
                        }`}
                      >
                        <span className="truncate">{i.name}</span>
                        <span className="text-xs tabular-nums text-subtle">{i.count}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {nexuses.length > 0 && (
              <div>
                <SectionHeader title="Explore the network" />
                <div className="space-y-0.5">
                  {nexuses.map((nx) => (
                    <Link
                      key={nx.slug}
                      href={`/nexuses/${nx.slug}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-elevated"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-primary-strong">
                        <Compass className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-text">{nx.name}</span>
                      <span className="text-xs tabular-nums text-subtle">{nx.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </MapZone>
    </IndexTemplate>
  )
}
