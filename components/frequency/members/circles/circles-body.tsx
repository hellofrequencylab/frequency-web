import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { Suspense } from 'react'
import '@/app/themes/active/members-b'
import type { CirclesIndexData } from '@/lib/circles/index-data'
import type { CircleCardData } from '@/components/circles/circle-card'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { MapZone } from '@/components/circles/circles-map'
import { FqFacetMenu, FqFindField, FqClearLink, type Params } from '@/components/frequency/members/shared/kit-tools'
import { FqCirclesMapBanner, FqFindNearMe } from './circles-map'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks } from '@/components/frequency/members/shell/nav'
import { templatesEnabled } from '@/lib/circles/templates-data'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { fqPlaceholderArt } from '@/lib/frequency/placeholder-art'
import type { CircleKind } from '@/lib/circles/kind'
import { distanceLabel, milesBetween } from '@/lib/feed/home-rank'
import { SystemNotice } from '@/components/frequency/members/shared/system-notice'

// CIRCLES, FREQUENCY BODY (templates/members/Circles.html). The head with Start a Circle, the
// viewer's own Circles as photo cards, then everything else under "Near you" with the Channel chips.
// Everything is the live index read (getCirclesIndexData): the cards, the viewer's memberships and
// the Channel filters (real links, so the filter stays shareable and server-side).
//
// THE HYBRID RULE (owner, design pass): the reference shows chips and cards only; the platform's
// Circles index also searches, filters by format and Channel, sorts, maps, features, nudges when
// Circles fill up and links the network's regions. All of it stays, drawn in the kit: the find row
// (kit-tools.tsx) under the head, the map behind "Find circles near me", a Featured row, the filling
// up nudge as a soft panel, and Explore the network as chips at the foot.
//
// THE FRAME (SCAN-880). The hub renders inside MembersBody, the members kit's page frame every other
// Frequency member body wears (the `data-kit="members"` scope and the kit's `.ap-main` column), so it
// sits on the members wash like the rest of the member site instead of drawing bare in the shell.
// STARTER CIRCLES (SCAN-880) are their own titled section, never mixed into "Near you", and every one
// carries art: its own image, else a brand photo picked from its slug (lib/frequency/placeholder-art).

const FORMATS = [
  { value: 'in-person', label: 'In person' },
  { value: 'online', label: 'Online' },
]
const SORTS = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'active', label: 'Busiest' },
  { value: 'new', label: 'Newest' },
  { value: 'open', label: 'Open spots' },
]

/** A card's art: its own image, else a brand photo picked from its slug, so no card is a blank block. */
export function circleTileArt(c: Pick<CircleCardData, 'imageUrl' | 'isStarter' | 'slug'>): string | null {
  return c.imageUrl || fqPlaceholderArt(c.slug)
}

function CircleTile({ c, next }: { c: CircleCardData; next?: string }) {
  const art = circleTileArt(c)
  const href = c.isStarter ? `/circles/starter/${c.slug}` : `/circles/${c.slug}`
  const place = c.context ?? (c.type === 'online' ? 'Online' : null)
  // One of the viewer's own Circles with a meetup coming reads like the reference ("Next: Fri
  // 6:15am"), and its place moves up beside the count; every other card keeps the place line.
  const first = [
    `${c.member_count} ${c.member_count === 1 ? 'member' : 'members'}`,
    c.isStarter ? 'Starter' : c.status === 'forming' ? 'Forming' : null,
    next ? place : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const second = next ? `Next: ${next}` : place
  return (
    <Link className="card fqm-card" href={href}>
      <span className="ph" style={art ? { backgroundImage: `url('${art}')` } : undefined}>
        {c.isFeatured && <span className="tag glass fqm-corner">Featured</span>}
      </span>
      <span className="fqm-card-b">
        <span className="h3">{c.name}</span>
        <span className="t2">{first}</span>
        {second && <span className="t2 fqm-body-ink">{second}</span>}
      </span>
    </Link>
  )
}

/** The Circles hub row. Starter Circles drops out while its flag is off (the page would only say so). */
async function CirclesHubLinks() {
  const starterOpen = await templatesEnabled()
  return (
    <HubLinks
      title="Circles"
      links={(v) => hubLinks('/circles', v).filter((l) => starterOpen || l.href !== '/circles/templates')}
    />
  )
}

const SHELF_CAP = 6

export interface FeaturedSpace {
  slug: string
  name: string
  tagline: string | null
  coverUrl: string | null
  logoUrl: string | null
}

/** Resonant near you: circles sharing a Channel with the member's own circles lead, then the closest.
 *  With a home base only in-person circles within 40 miles qualify, ranked by distance with a 15 mile
 *  head start for a shared Channel. Without one, the shelf is the circles that share a Channel. */
function resonantFor(cards: CircleCardData[], home: { lat: number; lng: number } | null, mine: Set<string>): CircleCardData[] {
  const shared = (c: CircleCardData) => (c.channelIds ?? []).some((id) => mine.has(id))
  if (!home) {
    return cards.filter(shared).sort((a, b) => b.member_count - a.member_count)
  }
  return cards
    .filter((c) => c.type === 'in-person' && c.latitude != null && c.longitude != null)
    .map((c) => ({ c, mi: milesBetween(home, { lat: c.latitude as number, lng: c.longitude as number }) }))
    .filter((x) => x.mi <= 40)
    .sort((a, b) => a.mi - (shared(a.c) ? 15 : 0) - (b.mi - (shared(b.c) ? 15 : 0)) || b.c.member_count - a.c.member_count)
    .map((x) => ({ ...x.c, context: [x.c.context, distanceLabel(x.mi)].filter(Boolean).join(' · ') }))
}

/** One titled shelf: the first six cards, the rest behind a native Show more (no script). */
function Shelf({
  id,
  title,
  note,
  circles,
  lead,
  empty,
}: {
  id: string
  title: string
  note: string
  circles: CircleCardData[]
  lead?: React.ReactNode
  empty?: React.ReactNode
}) {
  if (circles.length === 0 && !empty) return null
  const more = circles.slice(SHELF_CAP)
  return (
    <section className="sec" id={id} aria-labelledby={`${id}-h`}>
      <div className="sec-h">
        <span id={`${id}-h`} className="h2">{title}</span>
        <span className="meta">{note}</span>
      </div>
      {lead}
      {circles.length === 0 ? (
        empty
      ) : (
        <>
          <div className="g3">
            {circles.slice(0, SHELF_CAP).map((c) => (
              <CircleTile key={c.id} c={c} />
            ))}
          </div>
          {more.length > 0 && (
            <details className="fqm-more">
              <summary className="btn sm">Show {more.length} more</summary>
              <div className="g3">
                {more.map((c) => (
                  <CircleTile key={c.id} c={c} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

/** The sticky section index: anchors to each shelf that is on the page. */
function ShelfIndex({ shelves }: { shelves: { id: string; label: string }[] }) {
  return (
    <nav className="chips fqm-shelf-index" aria-label="Sections">
      {shelves.map((s) => (
        <a key={s.id} className="chip" href={`#${s.id}`}>
          {s.label}
        </a>
      ))}
    </nav>
  )
}

/** A few top Business Spaces, above the shelves: a window onto the directory, not a circle shelf. */
function FeaturedBusinessStrip({ spaces }: { spaces: FeaturedSpace[] }) {
  return (
    <section className="sec" aria-labelledby="fq-featured-spaces">
      <div className="sec-h">
        <span id="fq-featured-spaces" className="h2">Businesses worth a visit</span>
        <Link href="/spaces/directory" className="meta">All Business Spaces</Link>
      </div>
      <div className="g3">
        {spaces.slice(0, 3).map((sp) => (
          <Link key={sp.slug} className="card fqm-card" href={`/spaces/${sp.slug}`}>
            <span className="ph" style={{ backgroundImage: `url('${sp.coverUrl ?? fqPlaceholderArt(sp.slug)}')` }} />
            <span className="fqm-card-b">
              <span className="h3">{sp.name}</span>
              {sp.tagline && <span className="t2">{sp.tagline}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function FqCirclesBody({
  data,
  params,
  nextMeetups,
  home = null,
  featuredSpaces = [],
}: {
  data: CirclesIndexData
  params: Params
  /** The viewer's own Circles' next meetup, by Circle id (lib/circles/next-meetups.ts). */
  nextMeetups?: Map<string, string>
  /** The viewer's home base, for ranking circles by distance. */
  home?: { lat: number; lng: number } | null
  /** A few top Spaces for the Featured strip (lib/spaces/discovery, earned standing order). */
  featuredSpaces?: FeaturedSpace[]
}) {
  const {
    cards,
    myCircleIds,
    channelLinks,
    signedIn,
    canCreate,
    interests,
    filtering,
    content,
    showMap,
    locatable,
    starterSeeds,
    nearlyFullCount,
    hitFetchCap,
    fetchLimit,
    interestChips,
    nexuses,
  } = data
  const mine = new Set(myCircleIds)
  const yours = cards.filter((c) => mine.has(c.id))
  const starters = cards.filter((c) => c.isStarter && !mine.has(c.id))
  const near = cards.filter((c) => !c.isStarter && !mine.has(c.id))
  const shelfOf = (k: CircleKind) => near.filter((c) => c.kind === k)
  const myChannels = new Set(yours.flatMap((c) => c.channelIds ?? []))
  const resonant = resonantFor(near.filter((c) => c.kind === 'community'), home, myChannels).slice(0, 12)
  const resonantIds = new Set(resonant.map((c) => c.id))
  const gathering = [...near.filter((c) => c.kind === 'community' && !resonantIds.has(c.id))].sort((a, b) => b.member_count - a.member_count).slice(0, 12)
  const frequencyShelf = shelfOf('frequency')
  const communityShelf = shelfOf('community')
  const businessShelf = shelfOf('business')
  const shelfIndex = [
    yours.length > 0 && { id: 'your-circles', label: 'Yours' },
    { id: 'near-you', label: 'Near you' },
    starters.length > 0 && { id: 'starters', label: 'Starters' },
    gathering.length > 0 && { id: 'gathering', label: 'Gathering' },
    frequencyShelf.length > 0 && { id: 'frequency', label: 'Frequency' },
    { id: 'community', label: 'Community' },
    businessShelf.length > 0 && { id: 'business', label: 'Business' },
  ].filter((x): x is { id: string; label: string } => !!x)
  const anyFilter = filtering || !!params.sort

  const body = (
    <>
      <div className="head">
        <div>
          <span className="k">Community</span>
          <h1 className="h1">
            Your <span className="serif">Circles.</span>
          </h1>
          <span className="meta">The groups you keep coming back to.</span>
        </div>
        {signedIn && (
          <div className="row wrap">
            <NewCircleCompose interests={interests} buttonLabel="Start a Circle" canCreate={canCreate} buttonClass="btn pa sm" />
            {canCreate && (
              <Link className="btn sm" href="/lead">
                Manage my Circles
              </Link>
            )}
            {content.ctaLabel && content.ctaHref && (
              <a className="btn sm" href={content.ctaHref}>
                {content.ctaLabel}
              </a>
            )}
          </div>
        )}
      </div>
      {content.body && <p className="body fqm-intro">{content.body}</p>}

      <div className="fqm-tools">
        <FqFindField action="/circles" value={params.q} placeholder="Search Circles by name or place" keep={params} />
        <FqFacetMenu label="Format" paramKey="type" options={FORMATS} base="/circles" current={params} />
        {interestChips.length > 0 && (
          <FqFacetMenu
            label="Interest"
            paramKey="interest"
            options={interestChips.map((i) => ({ value: i.id, label: `${i.name} · ${i.count}` }))}
            base="/circles"
            current={params}
          />
        )}
        <FqFacetMenu
          label="Sort"
          paramKey="sort"
          options={SORTS}
          base="/circles"
          current={params.sort ? params : { ...params, sort: 'nearest' }}
          clearable={false}
          icon="chart"
        />
        {showMap && <FqFindNearMe />}
        <FqClearLink base="/circles" active={anyFilter} />
      </div>
      {showMap && <FqCirclesMapBanner />}

      {!filtering && <ShelfIndex shelves={shelfIndex} />}

      {yours.length > 0 ? (
        <div className="g3" id="your-circles">
          {yours.map((c) => (
            <CircleTile key={c.id} c={c} next={nextMeetups?.get(c.id)} />
          ))}
        </div>
      ) : (
        !filtering && (
          <div className="soft stack">
            <span className="h3">{signedIn ? 'No Circles yet.' : 'Find your people.'}</span>
            <span className="t2">
              {signedIn
                ? 'Join one below and it lives here, with its next meetup one tap away.'
                : 'Sign in to join a Circle and keep it here.'}
            </span>
          </div>
        )
      )}


      {!filtering && featuredSpaces.length > 0 && <FeaturedBusinessStrip spaces={featuredSpaces} />}

      {signedIn && nearlyFullCount > 0 && (
        <div className="soft row wrap sec">
          <span className="grow stack fqm-gap-sm">
            <span className="h3">
              {nearlyFullCount} {nearlyFullCount === 1 ? 'Circle is' : 'Circles are'} filling up
            </span>
            <span className="t2">
              A full Circle is a good problem. It means the next one is ready to start. Open the door for the people still
              looking for their room.
            </span>
          </span>
          <NewCircleCompose interests={interests} buttonLabel="Start the next Circle" canCreate={canCreate} buttonClass="btn pa" />
        </div>
      )}


      {!filtering && (
        <>
          <Shelf id="near-you" title="Resonant near you" note="Circles that share your interests, and the closest to home" circles={resonant} empty={
            <SystemNotice
              icon="pin"
              title={home ? 'No circles meet close to you yet.' : 'Set a home base to see circles close to you.'}
              body={home ? 'Start one and your neighbors can find it.' : 'We only use it to measure distance.'}
              actions={home ? [{ href: '/circles/new', label: 'Start a Circle', primary: true }] : [{ href: '/settings/profile', label: 'Set your home base', primary: true }]}
            />
          } />
          {starters.length > 0 && <Shelf id="starters" title="Starter Circles" note="Ready-made Circles waiting for someone to start them near you" circles={starters} />}
          <Shelf id="gathering" title="Where people are gathering" note="Circles with the most members right now" circles={gathering} />
          <Shelf id="community" title="Community Circles" note="Started by members, for members" circles={communityShelf} lead={
            <nav className="chips fqm-chips" aria-label="Channels">
              {channelLinks.map((l) => (
                <Link key={l.href} href={l.href} className={l.active ? 'chip on' : 'chip'} aria-current={l.active ? 'page' : undefined}>
                  {l.label === 'All' ? 'Anything' : l.label}
                </Link>
              ))}
            </nav>
          } empty={
            <SystemNotice icon="circle" title="No community circles yet." body="Be the first to start one." actions={[{ href: '/circles/new', label: 'Start a Circle', primary: true }]} />
          } />
          <Shelf id="frequency" title="Frequency Circles" note="Run by the platform, open to everyone" circles={frequencyShelf} />
          <Shelf id="business" title="Business Circles" note="Run by Business and Non Profit Spaces" circles={businessShelf} />
          {hitFetchCap && (
            <p className="t2 fqm-cap">
              Showing the first {fetchLimit} Circles. Search or filter to find what you are looking for.
            </p>
          )}
        </>
      )}

      {filtering && (
        <>
      {starters.length > 0 && (
        <section className="sec" aria-labelledby="fq-starter-circles">
          <div className="sec-h">
            <span id="fq-starter-circles" className="h2">
              Starter Circles
            </span>
            <span className="meta">Ready-made Circles waiting for someone to start them near you</span>
          </div>
          <div className="g3">
            {starters.map((c) => (
              <CircleTile key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      <div className="sec">
        <div className="sec-h">
          <span className="h2">Results</span>
          <span className="meta">
            {near.length} {near.length === 1 ? 'Circle' : 'Circles'}
          </span>
        </div>
        <nav className="chips fqm-chips" aria-label="Channels">
          {channelLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={l.active ? 'chip on' : 'chip'}
              aria-current={l.active ? 'page' : undefined}
            >
              {l.label === 'All' ? 'Anything' : l.label}
            </Link>
          ))}
        </nav>
        {hitFetchCap && (
          <p className="t2 fqm-cap">
            Showing the first {fetchLimit} Circles. Search or filter to find what you are looking for.
          </p>
        )}
        {near.length > 0 ? (
          <div className="g3">
            {near.map((c) => (
              <CircleTile key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            variant="no-results"
            title="No Circles match these filters."
            description="Try another Channel, or start the Circle you were looking for."
            action={
              <Link className="btn sm" href="/circles">
                See every Circle
              </Link>
            }
          />
        )}
      </div>

        </>
      )}

      {nexuses.length > 0 && (
        <div className="sec">
          <div className="sec-h">
            <span className="h2">Explore the network</span>
            <span className="meta">Circles by region</span>
          </div>
          <nav className="chips" aria-label="Regions">
            {nexuses.map((nx) => (
              <Link key={nx.slug} className="chip" href={`/spaces/${nx.slug}`}>
                {nx.name} <span className="t2">{nx.count}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
      <Suspense fallback={null}>
        <CirclesHubLinks />
      </Suspense>
    </>
  )

  // The map shares one state between the filter row's button and the pane above the grid, so the
  // whole body sits inside the zone when there is anything to map.
  return (
    <MembersBody>
      {showMap ? (
        <MapZone circles={locatable} starterSeeds={starterSeeds}>
          {body}
        </MapZone>
      ) : (
        body
      )}
    </MembersBody>
  )
}
