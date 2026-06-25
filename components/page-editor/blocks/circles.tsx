import type { ComponentConfig } from '@measured/puck'
import Link from 'next/link'
import { Users, Compass, Sparkles } from 'lucide-react'
import type { CirclesIndexData } from '@/lib/circles/index-data'
import { pillarTint } from '@/lib/pillars-style'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CircleCard } from '@/components/circles/circle-card'
import { CirclesToolbar } from '@/components/circles/circles-toolbar'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { MapZone, MapBanner, FindNearMeButton } from '@/components/circles/circles-map'

// The /circles index, decomposed into editable, rearrangeable page-editor blocks.
// Each block reads the live CirclesIndexData injected at render time via
// `puck.metadata.circlesIndex` (app/(main)/circles/page.tsx) — the same metadata-
// injection pattern the LiveStats/LiveEvents blocks use. So the PUBLISHED page shows
// real, faceted data while the EDITOR canvas (which has no metadata) shows a labelled
// placeholder operators can drag-rearrange. The faceted toolbar (search/filter/sort)
// and the map both stay self-contained client islands inside their block.

type PuckArg = { metadata?: Record<string, unknown> } | undefined
function indexFrom(puck: PuckArg): CirclesIndexData | undefined {
  return puck?.metadata?.circlesIndex as CirclesIndexData | undefined
}

// Shown in the editor canvas (no live data) so a section is visible + draggable there.
function EditorStub({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-8 text-center text-sm text-muted">
      {label}
      <span className="mt-0.5 block text-2xs text-subtle">Live circles show on the published page</span>
    </div>
  )
}

// The Channel (Pillar) quick-filter tags: "All" + every Channel, the active one filled in
// its Pillar tint. Shared by the standalone block and the find-near-me row. The count rides
// only when there's at least one circle, so empty Channels still show as plain category tags.
function ChannelPills({ links }: { links: CirclesIndexData['channelLinks'] }) {
  return (
    <nav className="-mx-1 flex flex-wrap items-center gap-2 px-1" aria-label="Filter circles by Channel">
      {links.map((link) => {
        // The Channel slug rides in the href (?channel=<slug>); "All" has none.
        const slug = link.href.includes('channel=') ? link.href.split('channel=')[1] : null
        const activeClass = slug ? pillarTint(slug) : 'bg-primary text-on-primary'
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={link.active ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              link.active ? activeClass : 'bg-surface-elevated text-muted hover:bg-surface hover:text-text'
            }`}
          >
            {link.label}
            {link.count > 0 && (
              <span className={`text-xs tabular-nums ${link.active ? 'opacity-70' : 'text-subtle'}`}>
                {link.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

export const circlesComponents: Record<string, ComponentConfig> = {
  // Pillar/Channel quick-filter as a standalone block (kept for operators who want the tags
  // on their own row). The default layout instead shows them beside the find-near-me button.
  CirclesChannelNav: {
    label: 'Circles · Channel filter chips',
    fields: {},
    render: ({ puck }) => {
      const d = indexFrom(puck)
      if (!d) return <EditorStub label="Channel filter chips" />
      return <ChannelPills links={d.channelLinks} />
    },
  },

  // The compact command bar: search, format toggle, sort. Self-contained, URL-driven
  // client island (CirclesToolbar). Channel category lives in the pillar pills above.
  CirclesToolbar: {
    label: 'Circles · Search, filter & sort',
    fields: {},
    render: ({ puck }) => {
      const d = indexFrom(puck)
      if (!d) return <EditorStub label="Search, filter & sort bar" />
      return <CirclesToolbar />
    },
  },

  // The discovery row: the "find near me" button with the Channel tags to its right, plus the
  // in-page map it expands (nearby circles + Starter pins). The map lives in one MapZone (it
  // shares React context). Extra top space separates it from the search row above. When there's
  // nothing to map, the row is just the Channel tags.
  CirclesMap: {
    label: 'Circles · Find near me & Channels',
    fields: {},
    render: ({ puck }) => {
      const d = indexFrom(puck)
      if (!d) return <EditorStub label="Find near me + Channel tags" />
      const pills = <ChannelPills links={d.channelLinks} />
      if (!d.showMap) return <div className="mt-4">{pills}</div>

      return (
        <MapZone circles={d.locatable} starterSeeds={d.starterSeeds}>
          <div className="mt-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <FindNearMeButton />
            {pills}
          </div>
          <MapBanner />
        </MapZone>
      )
    },
  },

  // A curated row of operator-Featured circles (circles.featured_at). Hidden when none.
  CirclesFeatured: {
    label: 'Circles · Featured row',
    fields: { heading: { type: 'text' } },
    defaultProps: { heading: 'Featured circles' },
    render: ({ heading, puck }) => {
      const d = indexFrom(puck)
      if (!d) return <EditorStub label="Featured circles row" />
      const featured = d.cards.filter((c) => c.isFeatured).slice(0, 3)
      if (featured.length === 0) return <></>

      return (
        <section className="rounded-3xl border border-primary-bg bg-gradient-to-br from-primary-bg/40 via-surface to-signal-bg/30 p-5 sm:p-6 dark:from-primary-bg/15 dark:via-surface dark:to-signal-bg/10">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
              <Sparkles className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-bold text-text">{(heading as string) || 'Featured circles'}</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((card) => (
              <CircleCard key={card.id} circle={card} isMember={d.myCircleIds.includes(card.id)} />
            ))}
          </div>
        </section>
      )
    },
  },

  // The main result grid — members first, then Starters to claim, then discovery —
  // with the "filling up" flywheel nudge, the fetch-cap notice, and the empty state.
  CirclesGrid: {
    label: 'Circles · Grid',
    fields: {},
    render: ({ puck }) => {
      const d = indexFrom(puck)
      if (!d) return <EditorStub label="Circles grid" />
      return (
        <div className="space-y-6">
          {d.signedIn && d.nearlyFullCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-bg bg-primary-bg/40 p-4 dark:bg-primary-bg/15">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">
                    {d.nearlyFullCount} {d.nearlyFullCount === 1 ? 'circle is' : 'circles are'} filling up
                  </p>
                  <p className="text-sm text-muted">
                    A full circle is a good problem. It means the next one&rsquo;s ready to start. Open the door
                    for the people still looking for their room.
                  </p>
                </div>
              </div>
              <NewCircleCompose
                interests={d.interests}
                buttonLabel="Start the next circle"
                buttonClass="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              />
            </div>
          )}

          {d.hitFetchCap && (
            <p className="text-xs text-subtle">
              Showing the first {d.fetchLimit} Circles. Use the filters above to find what you&rsquo;re looking for.
            </p>
          )}

          {d.cards.length === 0 ? (
            <EmptyState
              icon={Users}
              title={d.filtering ? 'No circles match these filters' : 'No circles yet'}
              description={
                d.filtering
                  ? 'Try a wider search, or start the first one for this corner of the network.'
                  : 'Be the first to start a circle for your neighborhood or a Channel.'
              }
              action={d.signedIn ? <NewCircleCompose interests={d.interests} buttonLabel="Start a circle" /> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {d.cards.map((card) => (
                <CircleCard key={card.id} circle={card} isMember={d.myCircleIds.includes(card.id)} />
              ))}
            </div>
          )}
        </div>
      )
    },
  },

  // Browse-by rails as a full-width row: by Channel (top interests) + by region (Nexuses).
  CirclesBrowse: {
    label: 'Circles · Browse by Channel & region',
    fields: {},
    render: ({ puck }) => {
      const d = indexFrom(puck)
      if (!d) return <EditorStub label="Browse by Channel & region" />
      if (d.interestChips.length === 0 && d.nexuses.length === 0) return <></>

      return (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          {d.interestChips.length > 0 && (
            <div>
              <SectionHeader title="Browse by Channel" />
              <div className="space-y-0.5">
                {d.interestChips.map((i) => {
                  const active = d.selectedInterest === i.id
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

          {d.nexuses.length > 0 && (
            <div>
              <SectionHeader title="Explore the network" />
              <div className="space-y-0.5">
                {d.nexuses.map((nx) => (
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
        </div>
      )
    },
  },
}
