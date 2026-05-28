import Link from 'next/link'
import { Search, Users, FileText, CalendarDays } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getInitials } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type PersonRow = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: string
}

type PostRow = {
  id: string
  body: string
  created_at: string
  author: { display_name: string; handle: string; avatar_url: string | null; community_role: string } | null
}

type EventRow = {
  id: string
  title: string
  slug: string
  starts_at: string
  location: string | null
  is_cancelled: boolean
  host: { display_name: string; handle: string } | null
}

const TABS = ['people', 'posts', 'events'] as const
type Tab = (typeof TABS)[number]

const ROLE_COLOR: Record<string, string> = {
  crew:   'bg-signal-bg text-signal-strong',
  host:   'bg-success-bg text-success',
  guide:  'bg-signal-bg text-signal-strong',
  mentor: 'bg-warning-bg text-warning',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
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

  if (query.length >= 2) {
    if (tab === 'people') {
      const { data } = await admin
        .from('profiles')
        .select('id, display_name, handle, avatar_url, community_role')
        .or(`display_name.ilike.%${query}%,handle.ilike.%${query}%`)
        .eq('is_active', true)
        .order('display_name')
        .limit(24)
      people = (data ?? []) as PersonRow[]
    }

    if (tab === 'posts') {
      const { data } = await admin
        .from('posts')
        .select(
          `id, body, created_at,
           author:profiles!author_id ( display_name, handle, avatar_url, community_role )`
        )
        .ilike('body', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      posts = (data ?? []) as unknown as PostRow[]
    }

    if (tab === 'events') {
      const { data } = await admin
        .from('events')
        .select(
          `id, title, slug, starts_at, location, is_cancelled,
           host:profiles!host_id ( display_name, handle )`
        )
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('starts_at', { ascending: true })
        .limit(20)
      events = (data ?? []) as unknown as EventRow[]
    }
  }

  // Result counts for tab labels
  const resultCount = { people: people.length, posts: posts.length, events: events.length }

  return (
    <div>
      <h1 className="text-xl font-semibold text-text mb-4">Search</h1>

      {/* ── Search form ──────────────────────────────────────── */}
      <form method="GET" action="/search" className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search people, posts, events…"
            autoFocus
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-surface pl-9 pr-4 py-2.5 text-sm text-text placeholder:text-subtle focus:border-primary dark:focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:focus:ring-primary/30"
          />
          {/* Preserve tab across searches */}
          <input type="hidden" name="tab" value={tab} />
        </div>
      </form>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => {
          const icons = { people: Users, posts: FileText, events: CalendarDays }
          const Icon = icons[t]
          const isActive = tab === t
          return (
            <Link
              key={t}
              href={`/search?q=${encodeURIComponent(query)}&tab=${t}`}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                isActive
                  ? 'border-gray-900 text-text'
                  : 'border-transparent text-subtle hover:text-text'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t}
              {query.length >= 2 && resultCount[t] > 0 && (
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${
                    isActive
                      ? 'bg-canvas dark:bg-surface text-white dark:text-text'
                      : 'bg-surface-elevated text-muted'
                  }`}
                >
                  {resultCount[t]}
                </span>
              )}
            </Link>
          )
        })}
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
            <EmptyState label={`No people matching "${query}"`} />
          ) : (
            <div className="space-y-0.5">
              {people.map((p) => {
                const isSelf = p.id === myProfileId
                const roleCls = ROLE_COLOR[p.community_role]
                return (
                  <Link
                    key={p.id}
                    href={`/people/${p.handle}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-elevated transition-colors -mx-3"
                  >
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt={p.display_name}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                        {getInitials(p.display_name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text">
                          {p.display_name}
                          {isSelf && (
                            <span className="ml-1 text-xs text-subtle font-normal">(you)</span>
                          )}
                        </span>
                        {roleCls && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium capitalize ${roleCls}`}>
                            {p.community_role}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-subtle mt-0.5">@{p.handle}</p>
                    </div>
                    <span className="text-xs text-subtle shrink-0">→</span>
                  </Link>
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
            <EmptyState label={`No posts matching "${query}"`} />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const a = post.author
                const roleCls = a?.community_role ? ROLE_COLOR[a.community_role] : null
                return (
                  <div
                    key={post.id}
                    className="rounded-2xl border border-border bg-surface shadow-sm px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      {a?.avatar_url ? (
                        <img
                          src={a.avatar_url}
                          alt={a.display_name}
                          className="w-7 h-7 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-[11px] font-semibold flex items-center justify-center shrink-0 select-none">
                          {a ? getInitials(a.display_name) : '?'}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                        {a && (
                          <Link
                            href={`/people/${a.handle}`}
                            className="text-sm font-medium text-text hover:underline truncate"
                          >
                            {a.display_name}
                          </Link>
                        )}
                        {roleCls && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium capitalize ${roleCls}`}>
                            {a!.community_role}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-subtle shrink-0">
                        {new Date(post.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-text leading-relaxed line-clamp-4">
                      {post.body}
                    </p>
                  </div>
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
            <EmptyState label={`No events matching "${query}"`} />
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface shadow-sm px-4 py-3 hover:border-primary-bg dark:hover:border-primary transition-colors"
                >
                  {/* Date block */}
                  <div className="shrink-0 w-10 flex flex-col items-center rounded-lg bg-surface-elevated py-1.5 text-center">
                    <span className="text-[10px] font-semibold text-subtle uppercase leading-none">
                      {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-lg font-black text-text leading-none mt-0.5">
                      {new Date(event.starts_at).getDate()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text truncate">
                        {event.title}
                      </span>
                      {event.is_cancelled && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-danger-bg text-danger font-medium">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-subtle">
                      <span>{formatDate(event.starts_at)}</span>
                      {event.location && <span>· {event.location}</span>}
                      {event.host && <span>· {event.host.display_name}</span>}
                    </div>
                  </div>

                  <span className="text-xs text-subtle shrink-0 pt-1">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-16 text-center">
      <Search className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
      <p className="text-sm text-subtle">{label}</p>
    </div>
  )
}
