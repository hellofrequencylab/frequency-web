import '@/app/themes/frequency/members-a.css'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { getCachedViewerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
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
import { FqToaster } from '../shared/toast'
import { FqAvatar, phStyle } from '../shared/avatar'
import { AddToggle, GoToggle } from '../shared/toggles'

// THE FREQUENCY SEARCH BODY (design_handoff/frequency/templates/members/Search.html): one large
// query field, kind chips, then Events / Circles / People sections in the main column and a side
// column of shortcuts. Every result is a real gated read from app/(main)/search/search-data.ts;
// Go and Add are the real RSVP and friend request.
//
// The design's Spaces and Listings chips have no search read behind them yet, so they are not
// shown; Posts, which the platform does search, takes their place. The design's "Recent" panel
// needs a search history the platform does not keep, so the side shows "Go to" (the ⌘K
// destinations) instead, and "Try" links to real /events filters.

const KINDS = [
  ['all', 'All'],
  ['people', 'People'],
  ['circles', 'Circles'],
  ['events', 'Events'],
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

  const [people, circles, events, posts, viewer, hats] = await Promise.all([
    want('people') ? searchPeople(safe, all ? 6 : undefined) : none<PersonRow>(),
    want('circles') ? searchCircles(safe, all ? 4 : undefined) : none<CircleRow>(),
    want('events') ? searchEvents(safe, all ? 5 : undefined) : none<EventRow>(),
    want('posts') ? searchPosts(safe, all ? 4 : undefined) : none<PostRow>(),
    getCachedViewerProfile(),
    ready ? getViewerHats() : Promise.resolve(null),
  ])

  const me = viewer?.id ?? null
  const admin = createAdminClient()
  const eventIds = events.rows.map((e) => e.id)
  const personIds = people.rows.map((p) => p.id).filter((id) => id !== me)
  const [rsvpR, friendR] = await Promise.all([
    me && eventIds.length ? admin.from('event_rsvps').select('event_id, status').eq('profile_id', me).in('event_id', eventIds) : Promise.resolve({ data: [] }),
    me && personIds.length
      ? admin.from('friendships').select('user_a_id, user_b_id, status').or(`user_a_id.eq.${me},user_b_id.eq.${me}`)
      : Promise.resolve({ data: [] }),
  ])
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

  const total = people.rows.length + circles.rows.length + events.rows.length + posts.rows.length
  const anyTruncated = people.truncated || circles.truncated || events.truncated || posts.truncated
  const countLine = !ready ? '' : total === 0 ? 'No results' : `${anyTruncated ? 'More than ' : ''}${total} ${total === 1 ? 'result' : 'results'}`
  const href = (k: Kind) => `/search?q=${encodeURIComponent(query)}${k === 'all' ? '' : `&tab=${k}`}`
  const now = new Date()

  return (
    <div>
      <FqToaster />
      <div className="stack" style={{ gap: 20 }}>
        <h1 className="k">Search</h1>
        <form method="GET" action="/search" className="fa-searchbar" role="search">
          <FqIcon name="search" />
          <input name="q" defaultValue={query} placeholder="People, Circles, events, posts" aria-label="Search" autoComplete="off" autoFocus />
          {kind !== 'all' && <input type="hidden" name="tab" value={kind} />}
          {countLine && <span className="meta">{countLine}</span>}
        </form>
        <nav className="chips" aria-label="What to search">
          {KINDS.map(([k, label]) => (
            <Link key={k} href={href(k)} className={kind === k ? 'chip on' : 'chip'} aria-current={kind === k ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="ap-cols sec" style={{ marginTop: 40 }}>
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
                {events.rows.map((e) => (
                  <div key={e.id}>
                    <Link href={`/events/${e.slug}`} className="ph fa-thumb72" aria-hidden tabIndex={-1} />
                    <span className="grow">
                      <Link href={`/events/${e.slug}`} className="t1" style={{ display: 'block' }}>{e.title}</Link>
                      <span className="t2">{[formatWhen(e.starts_at, now), e.location, e.host?.display_name].filter(Boolean).join(' · ')}</span>
                    </span>
                    {me && <GoToggle eventId={e.id} slug={e.slug} title={e.title} initial={going.has(e.id)} />}
                  </div>
                ))}
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
                      <Link href={`/people/${p.handle}`} className="t1" style={{ display: 'block' }}>{p.display_name}</Link>
                      <span className="t2">@{p.handle}{p.id === me ? ' · you' : ''}</span>
                    </span>
                    {me && p.id !== me && <AddToggle profileId={p.id} name={p.display_name} initial={edge.get(p.id) ?? 'none'} />}
                  </div>
                ))}
              </div>
              {!all && people.truncated && <More n={people.rows.length} noun="people" />}
            </section>
          )}

          {posts.rows.length > 0 && (
            <section className={events.rows.length + circles.rows.length + people.rows.length > 0 ? 'sec' : undefined}>
              <div className="sec-h">
                <h2 className="h2">Posts</h2>
                {all && posts.truncated && <Link className="meta" href={href('posts')}>See all</Link>}
              </div>
              <div className="list">
                {posts.rows.map((post) => (
                  <Link key={post.id} href={post.author ? `/people/${post.author.handle}` : '/feed'}>
                    <FqAvatar url={post.author?.avatar_url} name={post.author?.display_name ?? 'Member'} />
                    <span className="grow">
                      <span className="t1" style={{ display: 'block' }}>{post.author?.display_name ?? 'Member'}</span>
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
                      <span className="t1" style={{ display: 'block' }}>{d.label}</span>
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
  return <p className="meta" style={{ marginTop: 16 }}>Showing the first {n} {noun}. Add another word to narrow the search.</p>
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? `${flat.slice(0, 89)}…` : flat
}
