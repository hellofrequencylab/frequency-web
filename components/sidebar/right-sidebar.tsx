import Link from 'next/link'
import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials, relativeTime } from '@/lib/utils'
import { RANK_COLORS, RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'
import { CalendarDays, MapPin, Megaphone, Zap, Trophy, Award, Flame, Target, Gem } from 'lucide-react'
import { GettingStartedChecklist } from '@/components/feed/getting-started'
import { isOnline } from '@/lib/presence'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

interface RightSidebarProps {
  profileId: string
  role: CommunityRole
}

// ── Widget card shell ─────────────────────────────────────────────────────────

function WidgetCard({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100/80 dark:border-gray-800/50 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {title}
        </h3>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Upcoming Events ───────────────────────────────────────────────────────────

function DateChip({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  return (
    <div className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
      <span className="text-[9px] font-semibold uppercase leading-none">{month}</span>
      <span className="text-sm font-bold leading-tight">{day}</span>
    </div>
  )
}

async function UpcomingEventsWidget({ circleIds }: { circleIds: string[] }) {
  if (circleIds.length === 0) return null

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: raw } = await admin
    .from('events')
    .select('id, title, slug, location, starts_at')
    .in('scope_id', circleIds)
    .in('scope_type', ['circle', 'group'])
    .eq('is_cancelled', false)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(3)

  const events = (raw ?? []) as {
    id: string; title: string; slug: string; location: string | null; starts_at: string
  }[]

  if (events.length === 0) return null

  return (
    <WidgetCard title="Upcoming Events">
      <div className="p-2">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <DateChip iso={event.starts_at} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 truncate">{event.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {new Date(event.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {event.location && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5 inline" />
                    {event.location}
                  </span>
                )}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100/80 dark:border-gray-800/50">
        <Link
          href="/events"
          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          See all events →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Active Members ────────────────────────────────────────────────────────────

async function ActiveMembersWidget({ profileId, circleIds }: { profileId: string; circleIds: string[] }) {
  if (circleIds.length === 0) return null

  const admin = createAdminClient()

  const { data: rawRows } = await admin
    .from('memberships')
    .select(
      'profile_id, joined_at, profile:profiles!profile_id(id, display_name, handle, avatar_url, last_seen_at)'
    )
    .in('circle_id', circleIds)
    .eq('status', 'active')
    .neq('profile_id', profileId)
    .order('joined_at', { ascending: false })
    .limit(30)

  type MemberRow = {
    profile_id: string
    joined_at: string
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null; last_seen_at: string | null }
  }

  const seen = new Set<string>()
  const dedupedAll: MemberRow[] = []
  for (const row of rawRows ?? []) {
    if (!seen.has(row.profile_id)) {
      seen.add(row.profile_id)
      dedupedAll.push(row as unknown as MemberRow)
    }
  }

  // Float online members to the top so the widget feels alive.
  const sorted = [...dedupedAll].sort((a, b) => {
    const ao = isOnline(a.profile.last_seen_at) ? 1 : 0
    const bo = isOnline(b.profile.last_seen_at) ? 1 : 0
    if (ao !== bo) return bo - ao
    return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
  })
  const members = sorted.slice(0, 8)
  const onlineCount = dedupedAll.filter(m => isOnline(m.profile.last_seen_at)).length

  if (members.length === 0) return null

  return (
    <WidgetCard title="Members" badge={onlineCount > 0 ? `${onlineCount} online` : undefined}>
      <div className="p-2">
        {members.map((m: MemberRow) => {
          const online = isOnline(m.profile.last_seen_at)
          return (
            <Link
              key={m.profile_id}
              href={`/people/${m.profile.handle}`}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="relative shrink-0">
                {m.profile.avatar_url ? (
                  <img
                    src={m.profile.avatar_url}
                    alt={m.profile.display_name}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400 select-none">
                    {getInitials(m.profile.display_name ?? '')}
                  </div>
                )}
                {online && (
                  <span
                    aria-label="Online now"
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-900"
                  />
                )}
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                {m.profile.display_name}
              </span>
            </Link>
          )
        })}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100/80 dark:border-gray-800/50">
        <Link
          href="/people"
          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          View directory →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Recent Dispatches ─────────────────────────────────────────────────────────

async function RecentDispatchesWidget({
  profileId,
  circleIds,
}: {
  profileId: string
  circleIds: string[]
}) {
  const admin = createAdminClient()

  // Resolve hub → nexus IDs for the user's circles
  let hubIds: string[] = []
  let nexusIds: string[] = []
  if (circleIds.length > 0) {
    const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
    hubIds = (circles ?? []).map((c: { hub_id: string | null }) => c.hub_id).filter(Boolean) as string[]
  }
  if (hubIds.length > 0) {
    const { data: hubs } = await admin.from('hubs').select('nexus_id').in('id', hubIds)
    nexusIds = (hubs ?? []).map((h: { nexus_id: string | null }) => h.nexus_id).filter(Boolean) as string[]
  }

  const select = `id, title, audience_scope, published_at,
    author:profiles!author_id ( display_name ),
    linked_task:crew_tasks!linked_task_id ( id, name )`

  type DispatchRow = {
    id: string
    title: string
    audience_scope: string
    published_at: string
    author: { display_name: string } | null
    linked_task: { id: string; name: string } | null
  }

  const promises: Promise<{ data: DispatchRow[] | null }>[] = [
    admin.from('dispatches').select(select).eq('status', 'published').eq('author_id', profileId)
      .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchRow[] | null }>,
  ]
  if (circleIds.length > 0)
    promises.push(admin.from('dispatches').select(select).eq('status', 'published')
      .eq('audience_scope', 'circle').in('audience_id', circleIds)
      .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchRow[] | null }>)
  if (hubIds.length > 0)
    promises.push(admin.from('dispatches').select(select).eq('status', 'published')
      .eq('audience_scope', 'hub').in('audience_id', hubIds)
      .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchRow[] | null }>)
  if (nexusIds.length > 0)
    promises.push(admin.from('dispatches').select(select).eq('status', 'published')
      .eq('audience_scope', 'nexus').in('audience_id', nexusIds)
      .order('published_at', { ascending: false }).limit(5) as unknown as Promise<{ data: DispatchRow[] | null }>)

  const results = await Promise.all(promises)
  const combined = results.flatMap((r) => r.data ?? [])
  const seen = new Set<string>()
  const dispatches = combined
    .filter((d: DispatchRow) => { if (seen.has(d.id)) return false; seen.add(d.id); return true })
    .sort((a: DispatchRow, b: DispatchRow) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, 5)

  if (dispatches.length === 0) return null

  return (
    <WidgetCard title="Dispatches">
      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {dispatches.map((d: DispatchRow) => (
          <Link
            key={d.id}
            href={`/broadcast/${d.id}`}
            className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="shrink-0 w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center mt-0.5">
              {d.linked_task ? (
                <Zap className="w-3 h-3 text-amber-500" />
              ) : (
                <Megaphone className="w-3 h-3 text-indigo-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 line-clamp-1 leading-snug">
                {d.title}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {d.author?.display_name} · {relativeTime(d.published_at)}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100/80 dark:border-gray-800/50">
        <Link
          href="/broadcast"
          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          View all broadcasts →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

async function LeaderboardWidget({ profileId, circleIds }: { profileId: string; circleIds: string[] }) {
  if (circleIds.length === 0) return null

  const admin = createAdminClient()

  // Get all member IDs in the viewer's circles
  const { data: circleMembers } = await admin
    .from('memberships')
    .select('profile_id')
    .in('circle_id', circleIds)
    .eq('status', 'active')

  const memberIds = [...new Set((circleMembers ?? []).map((m: { profile_id: string }) => m.profile_id as string))]
  if (memberIds.length === 0) return null

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank')
    .in('id', memberIds)
    .order('current_season_zaps', { ascending: false })
    .limit(5)

  const top = (profiles ?? []) as {
    id: string; display_name: string; handle: string; avatar_url: string | null;
    current_season_zaps: number; current_season_rank: SeasonRank
  }[]

  if (top.length === 0) return null

  const rankColors = ['text-amber-500', 'text-gray-400', 'text-orange-400', 'text-gray-300 dark:text-gray-600', 'text-gray-300 dark:text-gray-600']

  return (
    <WidgetCard title="Leaderboard">
      <div className="p-2">
        {top.map((member, i) => {
          const isSelf = member.id === profileId
          const rankColor = RANK_COLORS[member.current_season_rank] ?? 'bg-slate-400'
          return (
            <Link
              key={member.id}
              href={`/people/${member.handle}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                isSelf ? 'bg-indigo-50/60 dark:bg-indigo-950/20' : ''
              }`}
            >
              <span className={`text-xs font-bold w-4 shrink-0 tabular-nums ${rankColors[i]}`}>{i + 1}</span>
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.display_name} className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                  {getInitials(member.display_name ?? '')}
                </div>
              )}
              <span className={`text-xs flex-1 truncate ${isSelf ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                {member.display_name}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full text-white ${rankColor}`}>
                  {RANK_LABELS[member.current_season_rank] ?? member.current_season_rank}
                </span>
                <div className="flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">
                    {(member.current_season_zaps ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100/80 dark:border-gray-800/50">
        <Link
          href="/crew/leaderboard"
          className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          Full leaderboard →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Gamification quick stats ─────────────────────────────────────────────────

async function GamificationWidget({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const [
    { data: profile },
    { data: streaks },
    { count: achievementCount },
  ] = await Promise.all([
    admin.from('profiles')
      .select('current_streak, achievement_count, lifetime_zaps, lifetime_gems')
      .eq('id', profileId)
      .maybeSingle(),
    admin.from('streaks')
      .select('streak_type, current_count')
      .eq('profile_id', profileId)
      .gt('current_count', 0),
    admin.from('user_achievements')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId),
  ])

  const currentStreak = (profile as any)?.current_streak ?? 0
  const achievements = achievementCount ?? 0
  const lifetimeZaps = (profile as any)?.lifetime_zaps ?? 0
  const lifetimeGems = (profile as any)?.lifetime_gems ?? 0

  if (achievements === 0 && currentStreak === 0 && lifetimeZaps === 0 && lifetimeGems === 0) return null

  return (
    <WidgetCard title="Your Progress">
      <div className="p-3 space-y-2">
        <Link
          href="/crew/achievements"
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Award className="w-4 h-4 text-violet-500" />
          <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">Achievements</span>
          <span className="text-xs font-bold text-gray-900 dark:text-gray-50">{achievements}</span>
        </Link>
        <Link
          href="/crew/streaks"
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Flame className={`w-4 h-4 ${currentStreak > 0 ? 'text-orange-500' : 'text-gray-300 dark:text-gray-600'}`} />
          <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">Streak</span>
          <span className="text-xs font-bold text-gray-900 dark:text-gray-50">{currentStreak}w</span>
        </Link>
        <Link
          href="/crew/challenges"
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">Lifetime Zaps</span>
          <span className="text-xs font-bold text-gray-900 dark:text-gray-50">{lifetimeZaps.toLocaleString()}</span>
        </Link>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <Gem className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">Community Gems</span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{lifetimeGems.toLocaleString()}</span>
        </div>
      </div>
    </WidgetCard>
  )
}

// ── Right sidebar ─────────────────────────────────────────────────────────────

export default async function RightSidebar({ profileId, role }: RightSidebarProps) {
  const admin = createAdminClient()

  // Fetch circle memberships once — used by multiple widgets
  const { data: myMemberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')

  const circleIds = (myMemberships ?? []).map((m: { circle_id: string }) => m.circle_id as string)

  const isCrew    = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(role)
  const isHost    = ['host', 'guide', 'mentor', 'janitor'].includes(role)

  return (
    <div className="px-4 py-6 space-y-4">
      {/* Getting Started — auto-hides when all items complete */}
      <Suspense fallback={null}>
        <GettingStartedChecklist profileId={profileId} />
      </Suspense>

      {/* Recent Dispatches */}
      <RecentDispatchesWidget profileId={profileId} circleIds={circleIds} />

      {/* Upcoming Events */}
      <UpcomingEventsWidget circleIds={circleIds} />

      {/* Active Members */}
      <ActiveMembersWidget profileId={profileId} circleIds={circleIds} />

      {isCrew && <LeaderboardWidget profileId={profileId} circleIds={circleIds} />}

      {isCrew && <GamificationWidget profileId={profileId} />}
    </div>
  )
}
