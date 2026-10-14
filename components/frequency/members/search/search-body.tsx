import '@/app/themes/active/members-a'
import '@/app/themes/active/members-b'
import '@/app/themes/active/members-community'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { getCachedViewerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo } from '@/lib/core/access-matrix'
import { matchDestinations } from '@/lib/search/destinations'
import { relativeTime } from '@/lib/utils'
import { formatWhen } from '@/app/(main)/events/index-data'
import {
  searchCircles,
  searchEvents,
  searchPeople,
  searchPosts,
  type CircleRow,
  type EventRow,
  type PersonRow,
  type PostRow,
  type Window,
} from '@/app/(main)/search/search-data'
import { listNetworkedSpacesPage, type NetworkedSpace } from '@/lib/spaces/discovery'
import { listListings, type MarketListingWithAuthor } from '@/lib/marketplace'
import { browsableAreas } from '@/lib/marketplace/visibility'
import { goingCountsByEvent } from '@/lib/events/going-counts'
import { HOME_TZ, isEventPast } from '@/lib/time/zone'
import { FqToaster } from '../shared/toast'
import { FqRecentSearches } from './recent-searches'
import { FqAvatar, phStyle } from '../shared/avatar'
import { AddToggle, GoToggle } from '../shared/toggles'
import { Input } from '@/components/ui/field'

// THE FREQUENCY SEARCH BODY (design_handoff/frequency/templates/members/Search.html): one large
// query field, kind chips, then Events / Circles / People sections in the main column and a side
// column of shortcuts. Every result is a real gated read from app/(main)/search/search-data.ts;
// Go and Add are the real RSVP and friend request.
//
// Every chip the design draws has a read behind it: People, Circles and Events from search-data.ts,
// Spaces from the networked directory (listNetworkedSpacesPage, the /spaces directory's own read),
// Listings from active Classifieds (shown only while that area is browsable), plus Posts, which the
// platform also searches. Event rows carry their cover, live dot and going count; a person carries
// the Circles you share. "Recent" is this device's own search history (recent-searches.tsx), "Go
// to" the ⌘K destinations, and "Try" real /events filters.

const KINDS = [
  ['all', 'All'],
  ['people', 'People'],
  ['circles', 'Circles'],
  ['events', 'Events'],
  ['spaces', 'Spaces'],
  ['listings', 'Listings'],
  ['posts', 'Posts'],
] as const
type Kind = (typeof KINDS)[number][0]

const TRY: [string, string][] = [
  ['Tonight', '/events?date=today'],
  ['This weekend', '/events?date=weekend'],
  ['Free', '/events?price=free'],
  ['Has open spots', '/events?spots=1'],
]

export async function FrequencySearch({ query, safe, rawTab }: { query: string; safe: string; rawTab: string }) {
  const kind: Kind = (KINDS.map((k) => k[0]) as string[]).includes(rawTab) ? (rawTab as Kind) : 'all'
  const ready = safe.length >= 2
  const want = (k: Kind) => ready && (kind === 'all' || kind === k)
  const all = kind === 'all'
  const none = <T,>(): Promise<Window<T>> => Promise.resolve({ rows: [], truncated: false })

  const areas = await browsableAreas()
  const listingsOn = areas.includes('market')
  const spaceCap = all ? 4 : 24
  const listingCap = all ? 4 : 24
  const [people, circles, events, posts, viewer, hats, spaces, listings] = await Promise.all([
    want('people') ? searchPeople(safe, all ? 6 : undefined) : none<PersonRow>(),
    want('circles') ? searchCircles(safe, all ? 4 : undefined) : none<CircleRow>(),
    want('events') ? searchEvents(safe, all ? 5 : undefined) : none<EventRow>(),
    want('posts') ? searchPosts(safe, all ? 4 : undefined) : none<PostRow>(),
    getCachedViewerProfile(),
    ready ? getViewerHats() : Promise.resolve(null),
    want('spaces')
      ? listNetworkedSpacesPage({ q: safe }, { limit: spaceCap })
          .then((r): Window<NetworkedSpace> => ({ rows: r.spaces, truncated: r.total > spaceCap }))
          .catch((): Window<NetworkedSpace> => ({ rows: [], truncated: false }))
      : none<NetworkedSpace>(),
    want('listings') && listingsOn
      ? listListings({ q: safe, limit: listingCap + 1 })
          .then((rows): Window<MarketListingWithAuthor> => ({ rows: rows.slice(0, listingCap), truncated: rows.length > listingCap }))
          .catch((): Window<MarketListingWithAuthor> => ({ rows: [], truncated: false }))
      : none<MarketListingWithAuthor>(),
  ])

  const me = viewer?.id ?? null
  // The viewer's own RSVPs and friendships, and the memberships of Circles they share with each person
  // (the memberships policy reads same-Circle rows), so the session client answers all three under RLS.
  const supabase = await createClient()
  const eventIds = events.rows.map((e) => e.id)
  const personIds = people.rows.map((p) => p.id).filter((id) => id !== me)
  const [rsvpR, friendR, goingN, memberR] = await Promise.all([
    me && eventIds.length ? supabase.from('event_rsvps').select('event_id, status').eq('profile_id', me).in('event_id', eventIds) : Promise.resolve({ data: [] }),
    me && personIds.length
      ? supabase.from('friendships').select('user_a_id, user_b_id, status').or(`user_a_id.eq.${me},user_b_id.eq.${me}`)
      : Promise.resolve({ data: [] }),
    eventIds.length ? goingCountsByEvent(eventIds).catch((): Record<string, number> => ({})) : Promise.resolve({} as Record<string, number>),
    // The Circles a person shares with the viewer: the reference's "4 mutual Circles".
    me && personIds.length
      ? supabase.from('memberships').select('profile_id, circle_id').eq('status', 'active').in('profile_id', [me, ...personIds])
      : Promise.resolve({ data: [] }),
  ])
  const circlesOf = new Map<string, Set<string>>()
  for (const m of (memberR.data ?? []) as { profile_id: string; circle_id: string | null }[]) {
    if (!m.circle_id) continue
    const set = circlesOf.get(m.profile_id) ?? new Set<string>()
    set.add(m.circle_id)
    circlesOf.set(m.profile_id, set)
  }
  const mineCircles = me ? circlesOf.get(me) ?? new Set<string>() : new Set<string>()
  const mutual = (id: string) => [...(circlesOf.get(id) ?? [])].filter((c) => mineCircles.has(c)).length
  const coverOf = (path: string | null | undefined) => (path ? supabase.storage.from('event-media').getPublicUrl(path).data.publicUrl : null)
  const going = new Set(((rsvpR.data ?? []) as { event_id: string; status: string }[]).filter((r) => r.status === 'going' || r.status === 'waitlist').map((r) => r.event_id))
  const edge = new Map<string, 'pending' | 'friends'>()
  for (const f of (friendR.data ?? []) as { user_a_id: string; user_b_id: string; status: string }[]) {
    const other = f.user_a_id === me ? f.user_b_id : f.user_a_id
    edge.set(other, f.status === 'accepted' ? 'friends' : 'pending')
  }

  const pages = hats
    ? matchDestinations(query)
        .filter((d) => !d.surface || accessTo(d.surface, hats) !== 'none')
        .slice(0, 5)
    : []

  const total = people.rows.length + circles.rows.length + events.rows.length + posts.rows.length + spaces.rows.length + listings.rows.length
  const anyTruncated = people.truncated || circles.truncated || events.truncated || posts.truncated || spaces.truncated || listings.truncated
  const countLine = !ready ? '' : total === 0 ? 'No results' : `${anyTruncated ? 'More than ' : ''}${total} ${total === 1 ? 'result' : 'results'}`
  const href = (k: Kind) => `/search?q=${encodeURIComponent(query)}${k === 'all' ? '' : `&tab=${k}`}`
  const now = new Date()

  return (
    <div>
      <FqToaster />
      <div className="stack fqm-search-head">
        <h1 className="k">Search</h1>
        <form method="GET" action="/search" className="fa-searchbar" role="search">
          <FqIcon name="search" />
          <Input variant="seamless" name="q" defaultValue={query} placeholder="People, Circles, events, Spaces, listings" aria-label="Search" autoComplete="off" autoFocus />
          {kind !== 'all' && <input type="hidden" name="tab" value={kind} />}
          {countLine && <span className="meta">{countLine}</span>}
        </form>
        <nav className="chips" aria-label="What to search">
          {KINDS.filter(([k]) => k !== 'listings' || listingsOn).map(([k, label]) => (
            <Link key={k} href={href(k)} className={kind === k ? 'chip on' : 'chip'} aria-current={kind === k ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="ap-cols sec fqm-search-cols">
        <div>
          {!ready && <p className="why">{query.length === 1 ? 'Keep typing.' : 'Type at least two letters to search.'}</p>}
          {ready && total === 0 && <p className="why">Nothing matching “{query}” yet. Try another word.</p>}

          {events.rows.length > 0 && (
            <section>
              <div className="sec-h">
                <h2 className="h2">Events</h2>
                {all && events.truncated && <Link className="meta" href={href('events')}>See all</Link>}
              </div>
              <div className="list">
                {events.rows.map((e) => {
                  const live = !!e.ends_at && isEventPast(e.starts_at, null, HOME_TZ, now) && !isEventPast(e.starts_at, e.ends_at, HOME_TZ, now)
                  const n = goingN[e.id] ?? 0
                  return (
                  <div key={e.id}>
                    <Link href={`/events/${e.slug}`} className="ph fa-thumb72" style={phStyle(coverOf(e.cover_image_path))} aria-hidden tabIndex={-1} />
                    <span className="grow">
                      <Link href={`/events/${e.slug}`} className="t1 fqm-t1-row">
                        {live && <span className="dot fq-breathe" aria-label="Happening now" />}
                        {e.title}
                      </Link>
                      <span className="t2">{[formatWhen(e.starts_at, now), e.location, e.host?.display_name, n > 0 ? `${n} going` : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    {me && <GoToggle eventId={e.id} slug={e.slug} title={e.title} initial={going.has(e.id)} />}
                  </div>
                  )
                })}
              </div>
              {!all && events.truncated && <More n={events.rows.length} noun="events" />}
            </section>
          )}

          {circles.rows.length > 0 && (
            <section className={events.rows.length > 0 ? 'sec' : undefined}>
              <div className="sec-h">
                <h2 className="h2">Circles</h2>
                {all && circles.truncated && <Link className="meta" href={href('circles')}>See all</Link>}
              </div>
              <div className="g2">
                {circles.rows.map((c) => (
                  <Link key={c.id} className="card" href={`/circles/${c.slug}`}>
                    <span className="ph fa-cardph" style={phStyle(c.image_url)} />
                    <span className="fa-cardbody">
                      <span className="h3">{c.name}</span>
                      <span className="t2">
                        {[c.member_count != null ? `${c.member_count} ${c.member_count === 1 ? 'member' : 'members'}` : null, c.neighborhood].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              {!all && circles.truncated && <More n={circles.rows.length} noun="Circles" />}
            </section>
          )}

          {people.rows.length > 0 && (
            <section className={events.rows.length + circles.rows.length > 0 ? 'sec' : undefined}>
              <div className="sec-h">
                <h2 className="h2">People</h2>
                {all && people.truncated && <Link className="meta" href={href('people')}>See all</Link>}
              </div>
              <div className="list">
                {people.rows.map((p) => (
                  <div key={p.id}>
                    <FqAvatar url={p.avatar_url} name={p.display_name} size="m" />
                    <span className="grow">
                      <Link href={`/people/${p.handle}`} className="t1 fqm-block">{p.display_name}</Link>
                      <span className="t2">
                        {[`@${p.handle}`, p.id === me ? 'you' : null, me && p.id !== me && mutual(p.id) > 0 ? `${mutual(p.id)} mutual ${mutual(p.id) === 1 ? 'Circle' : 'Circles'}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {me && p.id !== me && <AddToggle profileId={p.id} name={p.display_name} initial={edge.get(p.id) ?? 'none'} />}
                  </div>
                ))}
              </div>
              {!all && people.truncated && <More n={people.rows.length} noun="people" />}
            </section>
          )}

          {spaces.rows.length > 0 && (
            <section className={events.rows.length + circles.rows.length + people.rows.length > 0 ? 'sec' : undefined}>
              <div className="sec-h">
                <h2 className="h2">Spaces</h2>
                {all && spaces.truncated && <Link className="meta" href={href('spaces')}>See all</Link>}
              </div>
              <div className="g2">
                {spaces.rows.map((sp) => (
                  <Link key={sp.id} className="card" href={`/spaces/${sp.slug}`}>
                    <span className="ph fa-cardph" style={phStyle(sp.coverUrl ?? sp.logoUrl)} />
                    <span className="fa-cardbody">
                      <span className="h3">{sp.name}</span>
                      <span className="t2">{[sp.kindLabel, sp.tagline].filter(Boolean).join(' · ')}</span>
                    </span>
                  </Link>
                ))}
              </div>
              {!all && spaces.truncated && <More n={spaces.rows.length} noun="Spaces" />}
            </section>
          )}

          {listings.rows.length > 0 && (
            <section className={events.rows.length + circles.rows.length + people.rows.length + spaces.rows.length > 0 ? 'sec' : undefined}>
              <div className="sec-h">
                <h2 className="h2">Listings</h2>
                {all && listings.truncated && <Link className="meta" href={href('listings')}>See all</Link>}
              </div>
              <div className="list">
                {listings.rows.map((l) => (
                  <Link key={l.id} href={`/classifieds/${l.id}`}>
                    <span className="ph fa-thumb72" style={phStyle(l.images?.[0])} aria-hidden />
                    <span className="grow">
                      <span className="t1 fqm-block">{l.title}</span>
                      <span className="t2">
                        {[l.kind === 'free' ? 'Free' : l.price_note, l.author?.display_name, l.neighborhood ?? l.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              {!all && listings.truncated && <More n={listings.rows.length} noun="listings" />}
            </section>
          )}

          {posts.rows.length > 0 && (
            <section className={events.rows.length + circles.rows.length + people.rows.length + spaces.rows.length + listings.rows.length > 0 ? 'sec' : undefined}>
              <div className="sec-h">
                <h2 className="h2">Posts</h2>
                {all && posts.truncated && <Link className="meta" href={href('posts')}>See all</Link>}
              </div>
              <div className="list">
                {posts.rows.map((post) => (
                  <Link key={post.id} href={post.author ? `/people/${post.author.handle}` : '/feed'}>
                    <FqAvatar url={post.author?.avatar_url} name={post.author?.display_name ?? 'Member'} />
                    <span className="grow">
                      <span className="t1 fqm-block">{post.author?.display_name ?? 'Member'}</span>
                      <span className="t2">{excerpt(post.body)} · {relativeTime(post.created_at)}</span>
                    </span>
                  </Link>
                ))}
              </div>
              {!all && posts.truncated && <More n={posts.rows.length} noun="posts" />}
            </section>
          )}
        </div>

        <aside className="side">
          <FqRecentSearches current={ready ? query : ''} />
          {pages.length > 0 && (
            <div className="panel stack">
              <span className="k">Go to</span>
              <div className="list">
                {pages.map((d) => (
                  <Link key={d.href} href={d.href}>
                    <span className="ic">
                      <FqIcon name="arrow" />
                    </span>
                    <span className="grow">
                      <span className="t1 fqm-block">{d.label}</span>
                      <span className="t2">{d.group}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="panel stack">
            <span className="k">Try</span>
            <div className="chips">
              {TRY.map(([label, to]) => (
                <Link key={label} href={to} className="chip">
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function More({ n, noun }: { n: number; noun: string }) {
  return <p className="meta fqm-more">Showing the first {n} {noun}. Add another word to narrow the search.</p>
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat
}
