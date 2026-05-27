import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Megaphone, CalendarDays, Zap, ArrowRight } from 'lucide-react'
import { relativeTime } from '@/lib/utils'

type DispatchRow = {
  id: string
  title: string
  excerpt: string | null
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
    .select('id')
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
        id, title, excerpt, audience_scope, published_at,
        author:profiles!author_id ( display_name, avatar_url ),
        linked_task:crew_tasks!linked_task_id ( id, name )
      `)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(40)

  // Collect all visible dispatches
  const promises = []

  if (circleIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'circle').in('audience_id', circleIds))
  if (hubIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'hub').in('audience_id', hubIds))
  if (nexusIds.length > 0)
    promises.push(baseQuery().eq('audience_scope', 'nexus').in('audience_id', nexusIds))

  if (promises.length > 0) {
    const results = await Promise.all(promises)
    const combined = results.flatMap(r => r.data ?? [])
    // Dedupe + sort by published_at
    const seen = new Set<string>()
    dispatches = combined
      .filter((d: any) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
      .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 20) as unknown as DispatchRow[]
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
    .select('id, name, points_value, task_type')
    .order('points_value', { ascending: false })
    .limit(5)

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone className="w-5 h-5 text-indigo-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Broadcast</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Announcements, events, and challenges from your community.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Dispatches (main column) ───────────────────────── */}
        <div className="lg:col-span-2 space-y-1">
          {dispatches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
              <Megaphone className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No dispatches yet</p>
              <p className="text-xs text-gray-400 mt-1">Your hosts and guides will post here.</p>
            </div>
          ) : (
            dispatches.map(d => (
              <DispatchCard key={d.id} dispatch={d} />
            ))
          )}
        </div>

        {/* ── Sidebar: Events + Tasks ────────────────────────── */}
        <div className="space-y-5">

          {/* Upcoming events */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-wide uppercase">Upcoming</span>
            </div>
            {!events || events.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-4 text-center">No events scheduled.</p>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {events.map((e: any) => {
                  const d = new Date(e.starts_at)
                  return (
                    <li key={e.id}>
                      <Link href="/events" className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div className="shrink-0 w-10 text-center">
                          <div className="text-[10px] font-bold uppercase text-indigo-500 leading-none">
                            {d.toLocaleString('default', { month: 'short' })}
                          </div>
                          <div className="text-lg font-black text-gray-900 dark:text-gray-50 leading-tight">
                            {d.getDate()}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{e.title}</p>
                          {e.location && <p className="text-[11px] text-gray-400 truncate">{e.location}</p>}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-800">
              <Link href="/events" className="text-xs text-indigo-500 hover:underline">View all events →</Link>
            </div>
          </div>

          {/* Active challenges */}
          {tasks && tasks.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-wide uppercase">Active Challenges</span>
              </div>
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {tasks.map((t: any) => (
                  <li key={t.id}>
                    <Link href="/crew" className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <span className="text-xs text-gray-700 dark:text-gray-300 line-clamp-1">{t.name}</span>
                      <span className="text-[11px] font-semibold text-amber-500 shrink-0 ml-2">{t.points_value}pts</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-800">
                <Link href="/crew" className="text-xs text-indigo-500 hover:underline">All challenges →</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DispatchCard({ dispatch: d }: { dispatch: DispatchRow }) {
  return (
    <Link
      href={`/broadcast/${d.id}`}
      className="group block rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm transition-all"
    >
      {/* Scope badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
          {d.audience_scope} dispatch
        </span>
        {d.linked_task && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5" /> Challenge
          </span>
        )}
      </div>

      {/* Title */}
      <h2 className="text-base font-black text-gray-900 dark:text-gray-50 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
        {d.title}
      </h2>

      {/* Excerpt */}
      {d.excerpt && (
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
          {d.excerpt}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          {d.author && (
            <span className="font-medium text-gray-500 dark:text-gray-400">{d.author.display_name}</span>
          )}
          <span>·</span>
          <span>{relativeTime(d.published_at)}</span>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" />
      </div>
    </Link>
  )
}
