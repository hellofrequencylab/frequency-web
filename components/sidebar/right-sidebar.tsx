import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials, relativeTime } from '@/lib/utils'
import { RANK_LABELS, seasonRankStyle, SEASON_RANKS, rankForZaps, type SeasonRank } from '@/lib/season-ranks'
import { MapPin, Megaphone, Zap } from 'lucide-react'
import { GettingStartedChecklist } from '@/components/feed/getting-started'
import { isOnline, ONLINE_MS } from '@/lib/presence'
import { WidgetCard } from '@/components/modules/module-card'
import { GameStatsDockClient, type DockData } from '@/components/sidebar/game-stats-dock'
import { getPracticesToLogToday, getRecentPracticeLogs, getMemberPractices } from '@/lib/practices'
import { getRecentDispatchesForProfile } from '@/lib/dispatches'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

interface RightSidebarProps {
  profileId: string
  role: CommunityRole
}

// WidgetCard (the shared module chrome) now lives in
// components/modules/module-card.tsx — imported above.

// ── Upcoming Events ───────────────────────────────────────────────────────────

function DateChip({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  // Events use the green success palette so they read as "happening". Same
  // language the EventFeedCard speaks at the top of the feed.
  return (
    <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-success-bg text-success shrink-0">
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
      <div className="space-y-0.5">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <DateChip iso={event.starts_at} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text truncate">{event.title}</p>
              <p className="text-xs text-subtle mt-0.5">
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
      <div className="px-1 pt-3">
        <Link
          href="/events"
          className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors"
        >
          See all events →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Active Members ────────────────────────────────────────────────────────────

async function ActiveMembersWidget({ profileId, circleIds }: { profileId: string; circleIds: string[] }) {
  const admin = createAdminClient()

  type MemberRow = {
    profile_id: string
    joined_at: string | null
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null; last_seen_at: string | null }
  }

  // Two queries in parallel:
  // 1) Currently-online members anywhere in the community (engagement signal)
  // 2) Recent joiners across the viewer's circles (community signal)
  // Online members float to the top; circle-mates fill the rest.
  const onlineCutoff = new Date(new Date().getTime() - ONLINE_MS).toISOString()
  const [onlineRes, circleRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url, last_seen_at')
      .gte('last_seen_at', onlineCutoff)
      .neq('id', profileId)
      .order('last_seen_at', { ascending: false })
      .limit(12),
    circleIds.length > 0
      ? admin
          .from('memberships')
          .select(
            'profile_id, joined_at, profile:profiles!profile_id(id, display_name, handle, avatar_url, last_seen_at)'
          )
          .in('circle_id', circleIds)
          .eq('status', 'active')
          .neq('profile_id', profileId)
          .order('joined_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const seen = new Set<string>()
  const dedupedAll: MemberRow[] = []

  // Online members first
  for (const p of (onlineRes.data ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null; last_seen_at: string | null }[]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    dedupedAll.push({ profile_id: p.id, joined_at: null, profile: p })
  }
  // Then circle-mates
  for (const row of (circleRes.data ?? []) as MemberRow[]) {
    if (seen.has(row.profile_id)) continue
    seen.add(row.profile_id)
    dedupedAll.push(row)
  }

  const members = dedupedAll.slice(0, 8)
  const onlineCount = dedupedAll.filter(m => isOnline(m.profile.last_seen_at)).length

  if (members.length === 0) return null

  return (
    <WidgetCard title="Members" badge={onlineCount > 0 ? `${onlineCount} online` : undefined}>
      <div className="space-y-0.5">
        {members.map((m: MemberRow) => {
          const online = isOnline(m.profile.last_seen_at)
          return (
            <Link
              key={m.profile_id}
              href={`/people/${m.profile.handle}`}
              className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <div className="relative shrink-0">
                {m.profile.avatar_url ? (
                  <Image
                    src={m.profile.avatar_url}
                    alt={m.profile.display_name}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-border-strong flex items-center justify-center text-xs font-bold text-muted dark:text-subtle select-none">
                    {getInitials(m.profile.display_name ?? '')}
                  </div>
                )}
                {online && (
                  <span
                    aria-label="Online now"
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-surface"
                  />
                )}
              </div>
              <span className="text-sm font-medium text-text truncate flex-1">
                {m.profile.display_name}
              </span>
            </Link>
          )
        })}
      </div>
      <div className="px-1 pt-3">
        <Link
          href="/people"
          className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors"
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
  // Shared with the community news ticker — one query, one source of truth.
  const dispatches = await getRecentDispatchesForProfile(profileId, { circleIds, limit: 5 })

  if (dispatches.length === 0) return null

  return (
    <WidgetCard title="Broadcasts">
      <div className="space-y-0.5">
        {dispatches.map((d) => (
          <Link
            key={d.id}
            href={`/broadcast/${d.id}`}
            className="flex items-start gap-3 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <div className="shrink-0 w-7 h-7 rounded-lg bg-signal-bg flex items-center justify-center mt-0.5">
              {d.linkedTaskId ? (
                <Zap className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Megaphone className="w-3.5 h-3.5 text-signal-strong" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text line-clamp-1 leading-snug">
                {d.title}
              </p>
              <p className="text-xs text-subtle mt-0.5">
                {d.authorName} · {relativeTime(d.publishedAt)}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link
          href="/broadcast"
          className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors"
        >
          View all broadcasts →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
// Site-wide top earners. No self-highlight. The viewer reads the board the
// same way as any other rank list, which keeps it from feeling like a
// personalized callout when they're already on it.

async function LeaderboardWidget() {
  const admin = createAdminClient()

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank')
    .order('current_season_zaps', { ascending: false })
    .limit(5)

  const top = (profiles ?? []) as {
    id: string; display_name: string; handle: string; avatar_url: string | null;
    current_season_zaps: number; current_season_rank: SeasonRank
  }[]

  if (top.length === 0) return null

  const rankColors = ['text-primary', 'text-subtle', 'text-primary', 'text-subtle', 'text-subtle']

  return (
    <WidgetCard title="Leaderboard">
      <div className="space-y-0.5">
        {top.map((member, i) => {
          return (
            <Link
              key={member.id}
              href={`/people/${member.handle}`}
              className="flex items-center gap-2.5 px-1 py-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <span className={`text-sm font-bold w-4 shrink-0 tabular-nums ${rankColors[i]}`}>{i + 1}</span>
              {member.avatar_url ? (
                <Image src={member.avatar_url} alt={member.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-border-strong flex items-center justify-center text-xs font-bold text-muted shrink-0">
                  {getInitials(member.display_name ?? '')}
                </div>
              )}
              <span className="text-sm flex-1 truncate text-text">
                {member.display_name}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className="rank-badge text-[9px] font-bold leading-tight"
                  style={seasonRankStyle(member.current_season_rank)}
                >
                  {RANK_LABELS[member.current_season_rank] ?? member.current_season_rank}
                </span>
                <div className="flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5 text-primary" />
                  <span className="text-xs font-semibold text-muted">
                    {(member.current_season_zaps ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      <div className="px-1 pt-3">
        <Link
          href="/crew/leaderboard"
          className="text-[13px] font-semibold text-primary-strong hover:text-primary-hover transition-colors"
        >
          Full leaderboard →
        </Link>
      </div>
    </WidgetCard>
  )
}

// ── Game stats dock ───────────────────────────────────────────────────────────
// Server wrapper: assemble the player's "progress cockpit" and hand it to the
// interactive dock (components/sidebar/game-stats-dock.tsx). A compact bar sits
// at the bottom of the rail and scrolls up into view as you near the end;
// tapping it (or reaching the feed bottom, or hover-scrolling it) opens a panel
// with today's move, streak, rank progress, a quest, and The Vault at the very
// bottom. Everything is best-effort — any one source
// failing degrades to an empty/teaser state rather than breaking the rail.

async function GameStatsDock({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const [
    { data: profile },
    practicesToLog,
    memberPractices,
    recentLogs,
  ] = await Promise.all([
    admin.from('profiles')
      .select('current_season_zaps, lifetime_gems, current_streak')
      .eq('id', profileId).maybeSingle(),
    getPracticesToLogToday(profileId).catch(() => []),
    getMemberPractices(profileId).catch(() => []),
    getRecentPracticeLogs(profileId, 30).catch(() => []),
  ])

  const p = profile as {
    current_season_zaps?: number; lifetime_gems?: number; current_streak?: number
  } | null
  const zaps = p?.current_season_zaps ?? 0
  const gems = p?.lifetime_gems ?? 0
  const streak = p?.current_streak ?? 0
  // Derive rank from zaps (the stored current_season_rank can be stale).
  const rank = rankForZaps(zaps)

  // Today's move (North-Star daily action)
  const todaysMove: DockData['todaysMove'] =
    practicesToLog.length > 0
      ? { kind: 'log' }
      : memberPractices.length > 0
        ? { kind: 'done' }
        : { kind: 'adopt' }

  // Last 7 days streak strip
  const loggedDays = new Set(recentLogs.map((r) => r.logged_for))
  const today = new Date()
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    return loggedDays.has(d.toISOString().slice(0, 10))
  })

  // Rank progress to next tier
  const idx = SEASON_RANKS.findIndex((r) => r.rank === rank)
  const curIdx = idx < 0 ? 0 : idx
  const next = SEASON_RANKS[curIdx + 1]
  const curMin = SEASON_RANKS[curIdx]?.minZaps ?? 0
  const rankProgress = next
    ? {
        nextLabel: next.label,
        toGo: Math.max(0, next.minZaps - zaps),
        pct: next.minZaps > curMin ? Math.round(((zaps - curMin) / (next.minZaps - curMin)) * 100) : 0,
      }
    : { nextLabel: null, toGo: 0, pct: 100 }

  // Current quest (best-effort; tolerant of schema differences)
  let quest: DockData['quest'] = null
  try {
    const { data: qp } = await admin
      .from('quest_progress')
      .select('chain_id, current_step')
      .eq('profile_id', profileId)
      .is('completed_at', null)
      .order('started_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (qp) {
      const [{ data: chain }, { data: steps }] = await Promise.all([
        admin.from('quest_chains').select('name').eq('id', qp.chain_id).maybeSingle(),
        admin.from('quest_steps').select('step_order, name').eq('chain_id', qp.chain_id).order('step_order'),
      ])
      const total = (steps ?? []).length || 1
      const cur = (steps ?? []).find((s: { step_order: number }) => s.step_order === qp.current_step) as { name?: string } | undefined
      quest = {
        chain: (chain as { name?: string } | null)?.name ?? 'Your quest',
        step: cur?.name ?? `Step ${qp.current_step}`,
        pct: Math.round(((qp.current_step - 1) / total) * 100),
      }
    }
  } catch {
    quest = null
  }

  const data: DockData = {
    zaps,
    gems,
    streak,
    rank,
    todaysMove,
    last7,
    rankProgress,
    quest,
    vaultGems: gems,
  }

  return <GameStatsDockClient data={data} />
}

// ── Right sidebar ─────────────────────────────────────────────────────────────

export default async function RightSidebar({ profileId, role }: RightSidebarProps) {
  const admin = createAdminClient()

  // Fetch circle memberships once. Used by multiple widgets
  const { data: myMemberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')

  const circleIds = (myMemberships ?? []).map((m: { circle_id: string }) => m.circle_id as string)

  const isCrew    = ['crew', 'host', 'guide', 'mentor', 'admin', 'janitor'].includes(role)

  return (
    <div className="flex flex-1 flex-col">
      {/* Top of the rail scrolls with the feed. flex-1 pushes the stats dock to
          the bottom so it stays stuck there (like the left profile box). */}
      <div className="flex-1 px-3 py-6 space-y-8">
        {/* Getting Started. Auto-hides when all items complete */}
        <Suspense fallback={null}>
          <GettingStartedChecklist profileId={profileId} />
        </Suspense>

        {/* Recent Dispatches */}
        <RecentDispatchesWidget profileId={profileId} circleIds={circleIds} />

        {/* Upcoming Events */}
        <UpcomingEventsWidget circleIds={circleIds} />

        {/* Active Members */}
        <ActiveMembersWidget profileId={profileId} circleIds={circleIds} />

        {isCrew && <LeaderboardWidget />}
      </div>

      {/* Game stats sit below the rail content and scroll up with it. */}
      <GameStatsDock profileId={profileId} />
    </div>
  )
}
