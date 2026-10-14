import Link from 'next/link'
import { Suspense } from 'react'
import '@/app/themes/frequency/members-b.css'
import type { CirclesIndexData } from '@/lib/circles/index-data'
import type { CircleCardData } from '@/components/circles/circle-card'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { MapZone } from '@/components/circles/circles-map'
import { FqFacetMenu, FqFindField, FqClearLink, type Params } from '@/components/frequency/members/shared/kit-tools'
import { FqCirclesMapBanner, FqFindNearMe } from './circles-map'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks } from '@/components/frequency/members/shell/nav'
import { templatesEnabled } from '@/lib/circles/templates-data'

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

function CircleTile({ c, next }: { c: CircleCardData; next?: string }) {
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
      <span className="ph" style={c.imageUrl ? { backgroundImage: `url('${c.imageUrl}')` } : undefined}>
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

export function FqCirclesBody({
  data,
  params,
  nextMeetups,
}: {
  data: CirclesIndexData
  params: Params
  /** The viewer's own Circles' next meetup, by Circle id (lib/circles/next-meetups.ts). */
  nextMeetups?: Map<string, string>
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
  const near = cards.filter((c) => !mine.has(c.id))
  const featured = filtering ? [] : near.filter((c) => c.isFeatured).slice(0, 3)
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
            <NewCircleCompose interests={interests} buttonLabel="Start a Circle" canCreate={canCreate} buttonClass="btn pa lg" />
            {canCreate && (
              <Link className="btn lg" href="/lead">
                Manage my Circles
              </Link>
            )}
            {content.ctaLabel && content.ctaHref && (
              <a className="btn lg" href={content.ctaHref}>
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

      {yours.length > 0 ? (
        <div className="g3">
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

      {featured.length > 0 && (
        <div className="sec">
          <div className="sec-h">
            <span className="h2">Featured</span>
            <span className="meta">Picked by the people who run this community</span>
          </div>
          <div className="g3">
            {featured.map((c) => (
              <CircleTile key={c.id} c={c} />
            ))}
          </div>
        </div>
      )}

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

      <div className="sec">
        <div className="sec-h">
          <span className="h2">{filtering ? 'Results' : 'Near you'}</span>
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
          <div className="empty stack">
            <span className="h3">{filtering ? 'No Circles match these filters.' : 'Nothing here yet.'}</span>
            <span className="t2">Try another Channel, or start the Circle you were looking for.</span>
            {filtering && (
              <Link className="btn sm fqm-tag-start" href="/circles">
                See every Circle
              </Link>
            )}
          </div>
        )}
      </div>

      {nexuses.length > 0 && (
        <div className="sec">
          <div className="sec-h">
            <span className="h2">Explore the network</span>
            <span className="meta">Circles by region</span>
          </div>
          <nav className="chips" aria-label="Regions">
            {nexuses.map((nx) => (
              <Link key={nx.slug} className="chip" href={`/nexuses/${nx.slug}`}>
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
  return showMap ? (
    <MapZone circles={locatable} starterSeeds={starterSeeds}>
      {body}
    </MapZone>
  ) : (
    body
  )
}
