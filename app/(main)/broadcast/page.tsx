import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Megaphone, CalendarDays, Zap, ArrowRight } from 'lucide-react'
import { relativeTime } from '@/lib/utils'
import { BroadcastCompose } from './broadcast-compose'
import { ContextActions } from '@/components/context-actions'

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

export default async function BroadcastPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  // Get caller's profile + memberships
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  // Get circles the user belongs to
  const { data: memberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')

  const circleIds = (memberships ?? []).map((m: any) => m.circle_id as string)

  // Get hub IDs for those circles
  let hubIds: string[] = []
  if (circleIds.length > 0) {
    const { data: circles } = await admin
      .from('circles')
      .select('hub_id')
      .in('id', circleIds)
    hubIds = (circles ?? []).map((c: any) => c.hub_id).filter(Boolean) as string[]
  }

  // Get nexus IDs for those hubs
  let nexusIds: string[] = []
  if (hubIds.length > 0) {
    const { data: hubs } = await admin
      .from('hubs')
      .select('nexus_id')
      .in('id', hubIds)
    nexusIds = (hubs ?? []).map((h: any) => h.nexus_id).filter(Boolean) as string[]
  }

  // Build dispatch query — fetch all published dispatches visible to this user
  let dispatches: DispatchRow[] = []

  const baseQuery = () =>
    admin
      .from('dispatches')
      .select(`
        id, title, excerpt, audience_scope, published_at, author_id,
        author:profiles!author_id ( display_name, avatar_url ),
        linked_task:crew_tasks!linked_task_id ( id, name )
      `)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(40)

  // Collect all visible dispatches — by audience targeting + own authored dispatches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promises: any[] = [
    // Always include dispatches this user authored (creators see their own content)
    baseQuery().eq('author_id', profile.id),
  ]

  if (circleIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'circle').in('audience_id', circleIds))
  if (hubIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'hub').in('audience_id', hubIds))
  if (nexusIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'nexus').in('audience_id', nexusIds))

  const results = await Promise.all(promises)
  const combined = results.flatMap(r => r.data ?? [])
  // Dedupe + sort by published_at
  const seen = new Set<string>()
  dispatches = combined
    .filter((d: any) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, 20) as unknown as DispatchRow[]

  // Audience options for host+ compose form
  const isHost = HOST_PLUS.includes((profile as any).community_role as CommunityRole)
  let namedCircles: { id: string; name: string }[] = []
  let namedHubs:    { id: string; name: string }[] = []
  let namedNexuses: { id: string; name: string }[] = []

  if (isHost && circleIds.length > 0) {
    const { data: cRes } = await admin.from('circles').select('id, name').in('id', circleIds)
    namedCircles = cRes ?? []
  }
  if (isHost && hubIds.length > 0) {
    const { data: hRes } = await admin.from('hubs').select('id, name').in('id', hubIds)
    namedHubs = hRes ?? []
  }
  if (isHost && nexusIds.length > 0) {
    const { data: nRes } = await admin.from('nexuses').select('id, name').in('id', nexusIds)
    namedNexuses = nRes ?? []
  }

  // Upcoming events (next 5)
  const { data: events } = await admin
    .from('events')
    .select('id, title, starts_at, location')
    .gte('starts_at', new Date().toISOString())
    .eq('is_cancelled', false)
    .order('starts_at')
    .limit(5)

  // Active crew tasks (5)
  const { data: tasks } = await admin
    .from('crew_tasks')
    .select('id, name, zaps_value, task_type')
    .order('zaps_value', { ascending: false })
    .limit(5)

  const upcomingEventCount = events?.length ?? 0
  const activeChallengeCount = tasks?.length ?? 0

  return (
    <div>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-5 h-5 text-primary-strong" />
            <h1 className="text-2xl font-bold text-text">Broadcast</h1>
          </div>
          <p className="text-sm text-muted">
            Announcements, events, and challenges from your community.
          </p>
        </div>
        {isHost && (namedCircles.length > 0 || namedHubs.length > 0 || namedNexuses.length > 0) && (
          <BroadcastCompose circles={namedCircles} hubs={namedHubs} nexuses={namedNexuses} />
        )}
      </div>

      {/* ── Section tiles ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-7">
        <a href="#dispatches" className="group rounded-2xl border border-primary-bg bg-primary-bg p-4 hover:border-primary dark:hover:border-primary transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <Megaphone className="w-4 h-4 text-primary-strong" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-strong">Dispatches</span>
          </div>
          <p className="text-2xl font-black text-primary-strong">{dispatches.length}</p>
          <p className="text-[11px] text-primary-strong dark:text-primary-strong mt-0.5">announcements</p>
        </a>
        <a href="#events" className="group rounded-2xl border border-warning-bg bg-warning-bg/40 p-4 hover:border-warning transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-warning">Events</span>
          </div>
          <p className="text-2xl font-black text-warning">{upcomingEventCount}</p>
          <p className="text-[11px] text-primary dark:text-primary mt-0.5">upcoming</p>
        </a>
        <a href="#challenges" className="group rounded-2xl border border-success bg-success-bg/40 p-4 hover:border-success transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="w-4 h-4 text-success" />
            <span className="text-xs font-semibold uppercase tracking-wider text-success">Challenges</span>
          </div>
          <p className="text-2xl font-black text-success">{activeChallengeCount}</p>
          <p className="text-[11px] text-success dark:text-success mt-0.5">active</p>
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Dispatches (main column) ───────────────────────── */}
        <div id="dispatches" className="lg:col-span-2 space-y-1">
          {dispatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-canvas/50 p-12 text-center">
              <Megaphone className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted">No dispatches yet</p>
              <p className="text-xs text-subtle mt-1">Your hosts and guides will post here.</p>
            </div>
          ) : (
            dispatches.map(d => (
              <DispatchCard key={d.id} dispatch={d} viewerRole={(profile as any).community_role as CommunityRole} myProfileId={profile.id} />
            ))
          )}
        </div>

        {/* ── Sidebar: Events + Tasks ────────────────────────── */}
        <div className="space-y-5">

          {/* Upcoming events */}
          <div id="events" className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border">
              <CalendarDays className="w-3.5 h-3.5 text-subtle" />
              <span className="text-xs font-semibold text-text tracking-wide uppercase">Upcoming</span>
            </div>
            {!events || events.length === 0 ? (
              <p className="text-xs text-subtle px-4 py-4 text-center">No events scheduled.</p>
            ) : (
              <ul className="divide-y divide-border">
                {events.map((e: any) => {
                  const d = new Date(e.starts_at)
                  return (
                    <li key={e.id}>
                      <Link href="/events" className="flex items-start gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors">
                        <div className="shrink-0 w-10 text-center">
                          <div className="text-[10px] font-bold uppercase text-primary-strong leading-none">
                            {d.toLocaleString('default', { month: 'short' })}
                          </div>
                          <div className="text-lg font-black text-text leading-tight">
                            {d.getDate()}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text dark:text-subtle/60 line-clamp-1">{e.title}</p>
                          {e.location && <p className="text-[11px] text-subtle truncate">{e.location}</p>}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="px-4 py-2 border-t border-border">
              <Link href="/events" className="text-xs text-primary-strong hover:underline">View all events →</Link>
            </div>
          </div>

          {/* Active challenges */}
          {tasks && tasks.length > 0 && (
            <div id="challenges" className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-text tracking-wide uppercase">Active Challenges</span>
              </div>
              <ul className="divide-y divide-border">
                {tasks.map((t: any) => (
                  <li key={t.id}>
                    <Link href="/crew" className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-elevated transition-colors">
                      <span className="text-xs text-text line-clamp-1">{t.name}</span>
                      <span className="text-[11px] font-semibold text-primary shrink-0 ml-2">{(t as any).zaps_value} zaps</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-2 border-t border-border">
                <Link href="/crew" className="text-xs text-primary-strong hover:underline">All challenges →</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DispatchCard({ dispatch: d, viewerRole, myProfileId }: { dispatch: DispatchRow; viewerRole: CommunityRole; myProfileId: string }) {
  const isAuthor = d.author_id === myProfileId
  const showActions = isAuthor || HOST_PLUS.includes(viewerRole)

  return (
    <div className="group relative rounded-2xl border border-border bg-surface shadow-sm px-5 py-4 hover:border-primary-bg dark:hover:border-primary hover:shadow-md transition-all">
      {showActions && (
        <div className="absolute top-3 right-3 z-10">
          <ContextActions
            role={viewerRole}
            context={{ type: 'dispatch', id: d.id, isAuthor }}
          />
        </div>
      )}
      <Link href={`/broadcast/${d.id}`} className="block">
        {/* Scope badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-strong">
            {d.audience_scope} dispatch
          </span>
          {d.linked_task && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" /> Challenge
            </span>
          )}
        </div>

        {/* Title */}
        <h2 className="text-base font-black text-text leading-snug group-hover:text-primary-strong dark:group-hover:text-primary-strong transition-colors mb-1">
          {d.title}
        </h2>

        {/* Excerpt */}
        {d.excerpt && (
          <p className="text-sm text-muted line-clamp-2 leading-relaxed">
            {d.excerpt}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5 text-xs text-subtle">
            {d.author && (
              <span className="font-medium text-muted">{d.author.display_name}</span>
            )}
            <span>·</span>
            <span>{relativeTime(d.published_at)}</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-subtle group-hover:text-primary-strong transition-colors" />
        </div>
      </Link>
    </div>
  )
}
