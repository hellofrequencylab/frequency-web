import Image from 'next/image'
import { Search, MapPin, Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeOrTerm } from '@/lib/search-sanitize'
import { createClient } from '@/lib/supabase/server'
import { IndexTemplate } from '@/components/templates'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/field'
import { EntityCard } from '@/components/cards/entity-card'
import { PersonCard } from '@/components/cards/person-card'
import { DemoBadge } from '@/components/ui/demo-badge'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo } from '@/lib/core/access-matrix'
import { matchDestinations } from '@/lib/search/destinations'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  SERIES_COLUMNS,
  TEASER_CARDS_PER_SERIES,
  collapseSeriesAroundFloor,
  seriesFetchLimit,
  seriesUpcomingFloor,
  type SeriesFields,
} from '@/lib/events/series'

// ── Types ─────────────────────────────────────────────────────────────────────

type PersonRow = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: string
  is_demo: boolean
}

type PostRow = {
  id: string
  body: string
  created_at: string
  is_demo: boolean
  author: { display_name: string; handle: string; avatar_url: string | null; community_role: string } | null
}

type EventRow = SeriesFields & {
  id: string
  title: string
  slug: string
  starts_at: string
  location: string | null
  is_cancelled: boolean
  is_demo: boolean
  host: { display_name: string; handle: string } | null
}

// ── Result windows ────────────────────────────────────────────────────────────
// Each tab reads ONE bounded window; none of them cursors. Every window therefore
// over-fetches by exactly one row so the page can tell "that is all of them" from
// "that is the first N", and the UI says which (see `truncated` below). The tab count
// is shown ONLY when the window is complete: a truncated window is a floor, not a
// total, and printing it as a total was the bug (FINALIZE-PLAN §9.3).

/** People results per search. */
const PEOPLE_RESULTS = 24
/** Post results per search. */
const POST_RESULTS = 20
/** Event results the tab shows, counting REPEATING EVENTS rather than dates. */
const EVENT_RESULTS = 20

const TABS = ['people', 'posts', 'events'] as const
type Tab = (typeof TABS)[number]

type Results = {
  people: PersonRow[]
  posts: PostRow[]
  events: EventRow[]
  /** True when the active tab's window filled up, so more matches exist beyond it. */
  truncated: boolean
}

import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'
import { relativeTime, getInitials } from '@/lib/utils'

function hasRole(role: string | null | undefined): role is CommunityRole {
  return !!role && role in ROLE_RANK
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso)
  return (
    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
      <span className="text-meta font-semibold uppercase leading-none tracking-wide">
        {d.toLocaleDateString('en-US', { month: 'short' })}
      </span>
      <span className="text-body font-bold leading-tight">{d.getDate()}</span>
    </div>
  )
}

/**
 * The honest line under a FULL result window. None of the three tabs cursors, so a full
 * window means "there are more" and the page says so instead of printing the window size
 * as if it were the answer (FINALIZE-PLAN §9.3).
 */
function MoreResults({ shown, noun }: { shown: number; noun: string }) {
  return (
    <p className="mt-5 text-body-sm text-muted">
      Showing the first {shown} {noun}. Add another word to narrow the search.
    </p>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>
}) {
  const { q = '', tab: rawTab = 'people' } = await searchParams
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'people'
  const query = q.trim()
  // Sanitize before interpolating into PostgREST filters — this runs on the RLS-bypassing
  // service-role client, so an unsanitized `?q=` could inject extra `or()` conditions (ADR-274).
  const safe = sanitizeOrTerm(query)

  const admin = createAdminClient()
  const supabase = await createClient()

  // The tab query and the viewer-hats lookup depend only on the query string, NOT on the
  // signed-in identity, so fire them NOW and let them run concurrently with the auth +
  // profile read below (each is awaited at its point of use). This drops ~2 serial RTTs off
  // every search render vs. the old await-then-query-then-hats chain.
  const resultsP: Promise<Results> =
    (async () => {
      const empty: Results = {
        people: [] as PersonRow[],
        posts: [] as PostRow[],
        events: [] as EventRow[],
        truncated: false,
      }
      if (safe.length < 2) return empty

      if (tab === 'people') {
        const { data } = await admin
          .from('profiles')
          .select('id, display_name, handle, avatar_url, community_role, is_demo')
          .or(`display_name.ilike.%${safe}%,handle.ilike.%${safe}%`)
          .eq('is_active', true)
          .order('display_name')
          // +1: the extra row is never rendered, it only proves there are more.
          .limit(PEOPLE_RESULTS + 1)
        const rows = (data ?? []) as PersonRow[]
        return { ...empty, people: rows.slice(0, PEOPLE_RESULTS), truncated: rows.length > PEOPLE_RESULTS }
      }

      if (tab === 'posts') {
        const { data } = await admin
          .from('posts')
          .select(
            `id, body, created_at, is_demo,
             author:profiles!author_id ( display_name, handle, avatar_url, community_role )`
          )
          .ilike('body', `%${safe}%`)
          .eq('visibility', 'public')
          .is('hidden_at', null)
          .order('created_at', { ascending: false })
          .limit(POST_RESULTS + 1)
        const rows = (data ?? []) as unknown as PostRow[]
        return { ...empty, posts: rows.slice(0, POST_RESULTS), truncated: rows.length > POST_RESULTS }
      }

      // tab === 'events' (rawTab is validated to one of TABS at the top)
      //
      // TWO READS, AROUND THE FLOOR. This tab had no date predicate and ordered ascending, so its
      // window was the OLDEST twenty matching rows from the beginning of time. Folding that single
      // window would elect a series' very first date ever, which is a worse bug than the
      // duplication. Splitting it lets a running series lead with its NEXT date while a finished
      // one still answers with its LAST.
      //
      // A FACTORY, never one shared builder: PostgrestFilterBuilder mutates `this` and returns
      // `this`, and .order() concatenates, so calling .gte() on one instance and .lt() on the same
      // instance fires a single request carrying BOTH predicates and a doubled order — twice, and
      // it matches nothing.
      const eventsBase = () =>
        admin
          .from('events')
          .select(
            `id, title, slug, starts_at, location, is_cancelled, is_demo, ${SERIES_COLUMNS},
             host:profiles!host_id ( display_name, handle )`
          )
          .or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
          .eq('status', 'published')
          .eq('visibility', 'public')
          .eq('is_cancelled', false)

      const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
      // Fold ONE past the display window for the same reason the flat tabs read one extra
      // row: the fold caps at whatever it is handed, so a full window is otherwise
      // indistinguishable from an exact match count.
      const fetchLimit = seriesFetchLimit(EVENT_RESULTS + 1)
      const [upcoming, past] = await Promise.all([
        eventsBase().gte('starts_at', floor).order('starts_at', { ascending: true }).limit(fetchLimit),
        // NEWEST first, so the window below the floor is the most RECENT past dates rather than a
        // series' opening months. (The fold then elects the latest of them; the two together are
        // what stop a search for a long-running cowork answering with a date from years ago.)
        eventsBase().lt('starts_at', floor).order('starts_at', { ascending: false }).limit(fetchLimit),
      ])

      const folded = collapseSeriesAroundFloor(
        (upcoming.data ?? []) as unknown as EventRow[],
        (past.data ?? []) as unknown as EventRow[],
        EVENT_RESULTS + 1,
        { upcomingFrom: floor, perSeries: TEASER_CARDS_PER_SERIES },
      )
      return {
        ...empty,
        events: folded.slice(0, EVENT_RESULTS),
        truncated: folded.length > EVENT_RESULTS,
      }
    })()

  // getViewerHats does its own auth read internally; fired here it overlaps the getUser() below.
  const hatsP = query.length >= 2 ? getViewerHats() : null

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  if (user) {
    const { data: p } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    myProfileId = p?.id ?? null
  }

  const { people, posts, events, truncated } = await resultsP

  // Navigable destinations matching the query — the "Go to" shortcut row, tab-independent
  // (it sits above the People/Posts/Events tabs). Access-gated by the viewer's hats so a
  // member never sees admin tools and a visitor never sees member-only pages, exactly like
  // the ⌘K overlay's /api/search path.
  let pages: { href: string; label: string; group: string }[] = []
  if (hatsP) {
    const hats = await hatsP
    pages = matchDestinations(query)
      .filter((d) => !d.surface || accessTo(d.surface, hats) !== 'none')
      .slice(0, 8)
      .map((d) => ({ href: d.href, label: d.label, group: d.group }))
  }

  // Result counts for tab labels. Only the ACTIVE tab is queried, so the other two are 0 and
  // carry no badge either way. A TRUNCATED window is suppressed rather than printed: the number
  // in a tab badge reads as "this is how many there are", and on a filled window it is only how
  // many were fetched. The count under the results says the honest version.
  const resultCount = truncated
    ? { people: 0, posts: 0, events: 0 }
    : { people: people.length, posts: posts.length, events: events.length }

  return (
    <IndexTemplate
      title="Search"
      toolbar={
        <form method="GET" action="/search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
            <Input
              name="q"
              defaultValue={query}
              placeholder="Search people, posts, events…"
              aria-label="Search people, posts, events"
              autoFocus
              autoComplete="off"
              className="py-2.5 pl-9 pr-4"
            />
            {/* Preserve tab across searches */}
            <input type="hidden" name="tab" value={tab} />
          </div>
        </form>
      }
    >
      {/* ── Go to (destinations) — a tab-independent shortcut row above the tabs ── */}
      {query.length >= 2 && pages.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-body-sm font-semibold text-text">Go to</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((pg) => (
              <EntityCard
                key={pg.href}
                href={pg.href}
                anchor={
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
                    <Compass className="h-5 w-5" />
                  </span>
                }
                title={pg.label}
                context={pg.group}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="mb-6">
        <UnderlineTabs
          activeHref={`/search?q=${encodeURIComponent(query)}&tab=${tab}`}
          tabs={TABS.map((t) => ({
            href: `/search?q=${encodeURIComponent(query)}&tab=${t}`,
            label: t.charAt(0).toUpperCase() + t.slice(1),
            count: query.length >= 2 && resultCount[t] > 0 ? resultCount[t] : undefined,
          }))}
        />
      </div>

      {/* ── Empty / prompt states ────────────────────────────── */}
      {!query && (
        <p className="text-body-sm text-subtle text-center py-12">
          Type at least 2 characters to search.
        </p>
      )}
      {query.length === 1 && (
        <p className="text-body-sm text-subtle text-center py-12">
          Keep typing…
        </p>
      )}

      {/* ── People results ───────────────────────────────────── */}
      {tab === 'people' && query.length >= 2 && (
        <div>
          {people.length === 0 ? (
            <EmptyState icon={Search} title={`No people matching "${query}"`} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((p) => {
                const isSelf = p.id === myProfileId
                const role = (p.community_role ?? 'member') as CommunityRole
                return (
                  <PersonCard
                    key={p.id}
                    handle={p.handle}
                    displayName={p.display_name}
                    avatarUrl={p.avatar_url}
                    isDemo={p.is_demo}
                    context={isSelf ? `@${p.handle} · you` : `@${p.handle}`}
                    meta={hasRole(p.community_role) ? <RoleBadge role={role} className="text-meta leading-tight" /> : undefined}
                  />
                )
              })}
            </div>
          )}
          {truncated && <MoreResults shown={people.length} noun="people" />}
        </div>
      )}

      {/* ── Posts results ────────────────────────────────────── */}
      {tab === 'posts' && query.length >= 2 && (
        <div>
          {posts.length === 0 ? (
            <EmptyState icon={Search} title={`No posts matching "${query}"`} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {posts.map((post) => {
                const a = post.author
                // No standalone post permalink exists in the app; link to the
                // author's profile (the original made the author name the link).
                return (
                  <EntityCard
                    key={post.id}
                    href={a ? `/people/${a.handle}` : '/feed'}
                    anchor={
                      a?.avatar_url ? (
                        <Image src={avatarSrc(a.avatar_url)} alt="" width={44} height={44} className="h-11 w-11 rounded-pill object-cover" style={avatarFocusStyle(a.avatar_url)} />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-primary-bg text-body-sm font-semibold text-primary-strong select-none">
                          {a ? getInitials(a.display_name) : '?'}
                        </span>
                      )
                    }
                    title={a ? a.display_name : 'Unknown author'}
                    badge={post.is_demo ? <DemoBadge /> : undefined}
                    dimmed={post.is_demo}
                    context={a ? `@${a.handle}` : undefined}
                    description={post.body}
                    meta={<span>{relativeTime(post.created_at)}</span>}
                  />
                )
              })}
            </div>
          )}
          {truncated && <MoreResults shown={posts.length} noun="posts" />}
        </div>
      )}

      {/* ── Events results ───────────────────────────────────── */}
      {tab === 'events' && query.length >= 2 && (
        <div>
          {events.length === 0 ? (
            <EmptyState icon={Search} title={`No events matching "${query}"`} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {events.map((event) => (
                <EntityCard
                  key={event.id}
                  href={`/events/${event.slug}`}
                  anchor={<DateBlock iso={event.starts_at} />}
                  title={event.title}
                  badge={event.is_demo ? <DemoBadge /> : undefined}
                  dimmed={event.is_demo}
                  context={formatDate(event.starts_at)}
                  meta={
                    <>
                      {event.is_cancelled && (
                        <span className="rounded-md bg-danger-bg px-1.5 py-0.5 font-medium text-danger">
                          Cancelled
                        </span>
                      )}
                      {event.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />{event.location}
                        </span>
                      )}
                      {event.host && <span>{event.host.display_name}</span>}
                    </>
                  }
                />
              ))}
            </div>
          )}
          {truncated && <MoreResults shown={events.length} noun="events" />}
        </div>
      )}
    </IndexTemplate>
  )
}
