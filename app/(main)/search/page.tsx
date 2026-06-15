import Image from 'next/image'
import { Search, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeOrTerm } from '@/lib/search-sanitize'
import { createClient } from '@/lib/supabase/server'
import { IndexTemplate } from '@/components/templates'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { PersonCard } from '@/components/cards/person-card'
import { DemoBadge } from '@/components/ui/demo-badge'

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

type EventRow = {
  id: string
  title: string
  slug: string
  starts_at: string
  location: string | null
  is_cancelled: boolean
  is_demo: boolean
  host: { display_name: string; handle: string } | null
}

const TABS = ['people', 'posts', 'events'] as const
type Tab = (typeof TABS)[number]

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
      <span className="text-xs font-semibold uppercase leading-none tracking-wide">
        {d.toLocaleDateString('en-US', { month: 'short' })}
      </span>
      <span className="text-base font-bold leading-tight">{d.getDate()}</span>
    </div>
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

  let people: PersonRow[] = []
  let posts: PostRow[] = []
  let events: EventRow[] = []

  if (safe.length >= 2) {
    if (tab === 'people') {
      const { data } = await admin
        .from('profiles')
        .select('id, display_name, handle, avatar_url, community_role, is_demo')
        .or(`display_name.ilike.%${safe}%,handle.ilike.%${safe}%`)
        .eq('is_active', true)
        .order('display_name')
        .limit(24)
      people = (data ?? []) as PersonRow[]
    }

    if (tab === 'posts') {
      const { data } = await admin
        .from('posts')
        .select(
          `id, body, created_at, is_demo,
           author:profiles!author_id ( display_name, handle, avatar_url, community_role )`
        )
        .ilike('body', `%${safe}%`)
        .is('hidden_at', null)
        .order('created_at', { ascending: false })
        .limit(20)
      posts = (data ?? []) as unknown as PostRow[]
    }

    if (tab === 'events') {
      const { data } = await admin
        .from('events')
        .select(
          `id, title, slug, starts_at, location, is_cancelled, is_demo,
           host:profiles!host_id ( display_name, handle )`
        )
        .or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
        .order('starts_at', { ascending: true })
        .limit(20)
      events = (data ?? []) as unknown as EventRow[]
    }
  }

  // Result counts for tab labels
  const resultCount = { people: people.length, posts: posts.length, events: events.length }

  return (
    <IndexTemplate
      title="Search"
      toolbar={
        <form method="GET" action="/search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search people, posts, events…"
              autoFocus
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-surface pl-9 pr-4 py-2.5 text-sm text-text placeholder:text-subtle focus:border-border-strong dark:focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/30 dark:focus:ring-border-strong/30"
            />
            {/* Preserve tab across searches */}
            <input type="hidden" name="tab" value={tab} />
          </div>
        </form>
      }
    >
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
        <p className="text-sm text-subtle text-center py-12">
          Type at least 2 characters to search.
        </p>
      )}
      {query.length === 1 && (
        <p className="text-sm text-subtle text-center py-12">
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
                    meta={hasRole(p.community_role) ? <RoleBadge role={role} className="text-xs leading-tight" /> : undefined}
                  />
                )
              })}
            </div>
          )}
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
                        <Image src={a.avatar_url} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong select-none">
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
        </div>
      )}
    </IndexTemplate>
  )
}
