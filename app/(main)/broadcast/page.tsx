import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Megaphone, Zap, CalendarDays, Users, CircleDot, Radio, ArrowRight } from 'lucide-react'
import { relativeTime } from '@/lib/utils'
import { BroadcastCompose } from './broadcast-compose'
import { ContextActions } from '@/components/context-actions'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { SectionHeader } from '@/components/ui/section-header'
import { ModuleCard } from '@/components/modules/module-card'
import { PageHeading } from '@/components/templates/page-heading'

// /broadcast is the Community Dashboard — the counterpart to the Quest Dashboard
// (/crew), but for community life: what's being announced, what's coming up, and
// what's new to join, all in one place (ADR-097 follow-on). Aggregates dispatches
// (audience-targeted), upcoming events, and freshly-created circles.
export const dynamic = 'force-dynamic'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'
const HOST_PLUS: CommunityRole[] = ['host', 'guide', 'mentor', 'janitor']

type DispatchRow = {
  id: string
  title: string
  excerpt: string | null
  author_id: string
  audience_scope: string
  published_at: string
  author: { display_name: string; avatar_url: string | null } | null
  linked_task: { id: string; name: string } | null
}

type EventRow = { id: string; title: string; slug: string; location: string | null; starts_at: string }
type CircleRow = { id: string; name: string; slug: string; city: string | null; member_count: number; created_at: string }

function eventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default async function BroadcastPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  // Place tree the viewer belongs to (drives dispatch visibility).
  const { data: memberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')
  const circleIds = (memberships ?? []).map((m) => m.circle_id as string)

  let hubIds: string[] = []
  if (circleIds.length > 0) {
    const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
    hubIds = (circles ?? []).map((c) => c.hub_id).filter(Boolean) as string[]
  }
  let nexusIds: string[] = []
  if (hubIds.length > 0) {
    const { data: hubs } = await admin.from('hubs').select('nexus_id').in('id', hubIds)
    nexusIds = (hubs ?? []).map((h) => h.nexus_id).filter(Boolean) as string[]
  }

  // ── Dispatches visible to this viewer (own + targeted at their place tree) ──
  const baseQuery = () =>
    admin
      .from('dispatches')
      .select(`
        id, title, excerpt, audience_scope, published_at, author_id,
        author:profiles!author_id ( display_name, avatar_url ),
        linked_task:crew_tasks!linked_task_id ( id, name )
      `)
      .eq('status', 'published')
      .is('hidden_at', null)
      .order('published_at', { ascending: false })
      .limit(40)

  const promises: ReturnType<typeof baseQuery>[] = [
    baseQuery().eq('author_id', profile.id),
    // Global (staff/janitor) dispatches reach everyone (Phase D).
    baseQuery().eq('audience_scope', 'global'),
  ]
  if (circleIds.length > 0) promises.push(baseQuery().eq('audience_scope', 'circle').in('audience_id', circleIds))
  if (hubIds.length > 0) promises.push(baseQuery().eq('audience_scope', 'hub').in('audience_id', hubIds))
  if (nexusIds.length > 0) promises.push(baseQuery().eq('audience_scope', 'nexus').in('audience_id', nexusIds))

  const now = new Date()
  const nowIso = now.toISOString()
  const weekAgoIso = new Date(now.getTime() - 7 * 864e5).toISOString()
  const twoWeeksAgoIso = new Date(now.getTime() - 14 * 864e5).toISOString()

  const [dispatchResults, eventsRes, newCirclesRes, membersRes, circlesCountRes, eventsCountRes] = await Promise.all([
    Promise.all(promises),
    // Everything happening soon across the community (events are anon-readable).
    admin.from('events').select('id, title, slug, location, starts_at')
      .eq('is_cancelled', false).gte('starts_at', nowIso)
      .order('starts_at', { ascending: true }).limit(5),
    // Freshly-created circles to join.
    admin.from('circles').select('id, name, slug, city, member_count, created_at')
      .order('created_at', { ascending: false }).limit(5),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('circles').select('id', { count: 'exact', head: true }),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('is_cancelled', false).gte('starts_at', nowIso),
  ])

  const seen = new Set<string>()
  const dispatches = dispatchResults
    .flatMap((r) => r.data ?? [])
    .filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())
    .slice(0, 20) as unknown as DispatchRow[]

  const upcomingEvents = (eventsRes.data ?? []) as EventRow[]
  const newCircles = (newCirclesRes.data ?? []) as CircleRow[]
  const role = (profile as { community_role: CommunityRole }).community_role
  const broadcastsThisWeek = dispatches.filter((d) => (d.published_at ?? '') >= weekAgoIso).length
  const newCirclesCount = newCircles.filter((c) => (c.created_at ?? '') >= twoWeeksAgoIso).length

  // Host+ compose targets.
  const isHost = HOST_PLUS.includes(role)
  let namedCircles: { id: string; name: string }[] = []
  let namedHubs: { id: string; name: string }[] = []
  let namedNexuses: { id: string; name: string }[] = []
  if (isHost && circleIds.length > 0) {
    namedCircles = (await admin.from('circles').select('id, name').in('id', circleIds)).data ?? []
  }
  if (isHost && hubIds.length > 0) {
    namedHubs = (await admin.from('hubs').select('id, name').in('id', hubIds)).data ?? []
  }
  if (isHost && nexusIds.length > 0) {
    namedNexuses = (await admin.from('nexuses').select('id, name').in('id', nexusIds)).data ?? []
  }
  const canCompose = isHost && (namedCircles.length > 0 || namedHubs.length > 0 || namedNexuses.length > 0)

  const latest = dispatches[0]
  const nextEvent = upcomingEvents[0]

  return (
    <div>
      <PageHeading
        title="Community"
        description="Everything happening around you — announcements, what’s coming up, and what’s new to join."
        actions={
          (canCompose || role === 'janitor') ? (
            <BroadcastCompose circles={namedCircles} hubs={namedHubs} nexuses={namedNexuses} canGlobal={role === 'janitor'} />
          ) : undefined
        }
      />

      {/* ── Highlight hero: the latest broadcast, else the next event ── */}
      {latest ? (
        <Link
          href={`/broadcast/${latest.id}`}
          className="mb-6 flex items-center gap-4 rounded-2xl border border-primary-bg bg-primary-bg/40 p-5 transition-colors hover:bg-primary-bg/60 dark:bg-primary-bg/15 dark:hover:bg-primary-bg/25"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
            {latest.linked_task ? <Zap className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-subtle">Latest broadcast</p>
            <p className="text-base font-bold leading-tight text-text">{latest.title}</p>
            {latest.excerpt && <p className="mt-0.5 line-clamp-1 text-sm leading-relaxed text-muted">{latest.excerpt}</p>}
          </div>
          <ArrowRight className="hidden h-4 w-4 shrink-0 text-primary-strong sm:block" />
        </Link>
      ) : nextEvent ? (
        <Link
          href={`/events/${nextEvent.slug}`}
          className="mb-6 flex items-center gap-4 rounded-2xl border border-primary-bg bg-primary-bg/40 p-5 transition-colors hover:bg-primary-bg/60 dark:bg-primary-bg/15 dark:hover:bg-primary-bg/25"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-subtle">Coming up</p>
            <p className="text-base font-bold leading-tight text-text">{nextEvent.title}</p>
            <p className="mt-0.5 text-sm text-muted">{eventDate(nextEvent.starts_at)}{nextEvent.location ? ` · ${nextEvent.location}` : ''}</p>
          </div>
          <ArrowRight className="hidden h-4 w-4 shrink-0 text-primary-strong sm:block" />
        </Link>
      ) : null}

      {/* ── At-a-glance line ─────────────────────────────────── */}
      {/* One calm summary instead of a wall of stat tiles — the hero above and
          the quick-links sidebar already carry navigation, so these are just
          context. */}
      <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span><strong className="font-semibold text-text tabular-nums">{dispatches.length}</strong> recent broadcasts</span>
        {broadcastsThisWeek > 0 && <span className="text-subtle">({broadcastsThisWeek} this week)</span>}
        <span aria-hidden className="text-subtle">·</span>
        <span><strong className="font-semibold text-text tabular-nums">{(eventsCountRes.count ?? upcomingEvents.length).toLocaleString()}</strong> upcoming events</span>
        <span aria-hidden className="text-subtle">·</span>
        <span><strong className="font-semibold text-text tabular-nums">{(circlesCountRes.count ?? 0).toLocaleString()}</strong> circles</span>
        {newCirclesCount > 0 && <span className="text-subtle">({newCirclesCount} new)</span>}
        <span aria-hidden className="text-subtle">·</span>
        <span><strong className="font-semibold text-text tabular-nums">{(membersRes.count ?? 0).toLocaleString()}</strong> members</span>
      </p>

      {/* ── Main: broadcasts (left) + happenings (right) ─────── */}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <SectionHeader title="Latest broadcasts" count={dispatches.length > 0 ? dispatches.length : undefined} />
          {dispatches.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No broadcasts yet"
              description="Your hosts and guides post announcements, events, and challenges here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {dispatches.map((d) => (
                <DispatchCard key={d.id} dispatch={d} viewerRole={role} myProfileId={profile.id} />
              ))}
            </div>
          )}
        </div>

        <div className="w-full shrink-0 space-y-4 lg:w-72">
          {/* Quick links across community surfaces */}
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/events" Icon={CalendarDays} label="Events" sub="What’s on" color="bg-primary-bg text-primary-strong" />
            <QuickLink href="/circles" Icon={CircleDot} label="Circles" sub="Find your people" color="bg-signal-bg text-signal-strong" />
            <QuickLink href="/channels" Icon={Radio} label="Channels" sub="By interest" color="bg-broadcast-bg text-broadcast-strong" />
            <QuickLink href="/people" Icon={Users} label="Directory" sub="The community" color="bg-warning-bg text-warning" />
          </div>

          {upcomingEvents.length > 0 && (
            <ModuleCard title="Happening soon">
              <div className="space-y-0.5">
                {upcomingEvents.map((e) => (
                  <Link key={e.id} href={`/events/${e.slug}`} className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-elevated">
                    <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                      <span className="text-[9px] font-bold uppercase leading-none">{new Date(e.starts_at).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="text-sm font-bold leading-none">{new Date(e.starts_at).getDate()}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{e.title}</p>
                      <p className="mt-0.5 truncate text-xs text-subtle">{eventDate(e.starts_at)}{e.location ? ` · ${e.location}` : ''}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </ModuleCard>
          )}

          {newCircles.length > 0 && (
            <ModuleCard title="New circles">
              <div className="space-y-0.5">
                {newCircles.map((c) => (
                  <Link key={c.id} href={`/circles/${c.slug}`} className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-elevated">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-signal-bg text-signal-strong">
                      <CircleDot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-subtle">
                        {c.member_count} {c.member_count === 1 ? 'member' : 'members'}{c.city ? ` · ${c.city}` : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </ModuleCard>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickLink({ href, Icon, label, sub, color }: {
  href: string; Icon: React.ElementType; label: string; sub: string; color: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border bg-surface p-3 shadow-sm transition-colors hover:border-primary-bg dark:hover:border-primary"
    >
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-semibold leading-none text-text">{label}</div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </Link>
  )
}

function DispatchCard({ dispatch: d, viewerRole, myProfileId }: { dispatch: DispatchRow; viewerRole: CommunityRole; myProfileId: string }) {
  const isAuthor = d.author_id === myProfileId
  const showActions = isAuthor || HOST_PLUS.includes(viewerRole)
  const scope = d.audience_scope
    ? d.audience_scope.charAt(0).toUpperCase() + d.audience_scope.slice(1)
    : 'Community'

  return (
    <EntityCard
      href={`/broadcast/${d.id}`}
      anchor={
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          {d.linked_task ? <Zap className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
        </div>
      }
      title={d.title}
      context={d.linked_task ? `${scope} · Challenge` : `${scope} broadcast`}
      description={d.excerpt ?? undefined}
      meta={
        <>
          {d.author && <span>{d.author.display_name}</span>}
          <span>{relativeTime(d.published_at)}</span>
        </>
      }
      action={
        showActions
          ? <ContextActions role={viewerRole} context={{ type: 'dispatch', id: d.id, isAuthor }} />
          : undefined
      }
    />
  )
}
