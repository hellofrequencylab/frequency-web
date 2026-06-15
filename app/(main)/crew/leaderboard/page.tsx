import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Zap, TrendingUp, Award, Flame, Gem, QrCode, UserPlus, Filter } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getRankDef, rankForCompletion, journeysFinishedThisSeason, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'
import { LeaderboardTabs } from './leaderboard-tabs'
import { listEntryPointLeaderboard, signupsToNextTier } from '@/lib/entry-points/leaderboard'
import { getCurrentSeason } from '@/lib/seasons'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { StandingHero } from '@/components/gamification/standing-hero'

interface LeaderboardEntry {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  seasonZaps: number
  seasonRank: SeasonRank
  streak: number
  achievements: number
  lifetimeGems: number
}

async function getLeaderboard(
  admin: ReturnType<typeof createAdminClient>,
  scope: string,
  profileId: string,
  limit: number,
): Promise<{ entries: LeaderboardEntry[]; scopeLabel: string }> {
  let memberIds: string[] = []
  let scopeLabel = 'Global'

  if (scope === 'circle' || scope === 'hub' || scope === 'nexus') {
    const { data: myMemberships } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')

    const circleIds = (myMemberships ?? []).map((m) => m.circle_id as string)

    if (scope === 'circle') {
      if (circleIds.length === 0) return { entries: [], scopeLabel: 'My Circle' }
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', circleIds)
        .eq('status', 'active')
      memberIds = [...new Set((members ?? []).map((m) => m.profile_id as string))]
      scopeLabel = 'My Circle'
    } else if (scope === 'hub') {
      const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
      const hubIds = [...new Set((circles ?? []).map((c) => c.hub_id).filter((id): id is string => Boolean(id)))]
      if (hubIds.length === 0) return { entries: [], scopeLabel: 'My Hub' }

      const { data: hubCircles } = await admin.from('circles').select('id').in('hub_id', hubIds)
      const allCircleIds = (hubCircles ?? []).map((c) => c.id as string)
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', allCircleIds)
        .eq('status', 'active')
      memberIds = [...new Set((members ?? []).map((m) => m.profile_id as string))]
      scopeLabel = 'My Hub'
    } else if (scope === 'nexus') {
      const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
      const hubIds = [...new Set((circles ?? []).map((c) => c.hub_id).filter((id): id is string => Boolean(id)))]
      if (hubIds.length === 0) return { entries: [], scopeLabel: 'My Nexus' }

      const { data: hubs } = await admin.from('hubs').select('nexus_id').in('id', hubIds)
      const nexusIds = [...new Set((hubs ?? []).map((h) => h.nexus_id).filter((id): id is string => Boolean(id)))]
      if (nexusIds.length === 0) return { entries: [], scopeLabel: 'My Nexus' }

      const { data: nexusHubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
      const allHubIds = (nexusHubs ?? []).map((h) => h.id as string)
      const { data: nexusCircles } = await admin.from('circles').select('id').in('hub_id', allHubIds)
      const allCircleIds = (nexusCircles ?? []).map((c) => c.id as string)
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', allCircleIds)
        .eq('status', 'active')
      memberIds = [...new Set((members ?? []).map((m) => m.profile_id as string))]
      scopeLabel = 'My Nexus'
    }
  }

  const isGemsScope = scope === 'gems'
  const orderCol = isGemsScope ? 'lifetime_gems' : 'current_season_zaps'

  let query = admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank, current_streak, achievement_count, lifetime_gems')
    .eq('is_active', true)
    .eq('is_system', false) // hide system accounts (e.g. @moderation) from the board
    .order(orderCol, { ascending: false })
    .limit(isGemsScope ? 50 : limit)

  if (memberIds.length > 0 && !isGemsScope) {
    query = query.in('id', memberIds)
  } else if (!isGemsScope && scope !== 'global') {
    return { entries: [], scopeLabel }
  }

  if (isGemsScope) {
    scopeLabel = 'All-Time Gems'
    query = query.gt('lifetime_gems', 0)
  }

  const { data: profiles } = await query

  const entries: LeaderboardEntry[] = (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    handle: p.handle,
    avatarUrl: p.avatar_url,
    seasonZaps: p.current_season_zaps ?? 0,
    seasonRank: (p.current_season_rank ?? 'ghost') as SeasonRank,
    streak: p.current_streak ?? 0,
    achievements: p.achievement_count ?? 0,
    lifetimeGems: p.lifetime_gems ?? 0,
  }))

  return { entries, scopeLabel }
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, current_season_zaps, current_streak, lifetime_gems')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  // The viewer's own standing — featured up top so the board always answers
  // "where do I sit" before listing everyone else (the four counts, §2).
  const myZaps = (profile as { current_season_zaps: number | null }).current_season_zaps ?? 0
  const myGems = (profile as { lifetime_gems: number | null }).lifetime_gems ?? 0
  const myStreak = (profile as { current_streak: number | null }).current_streak ?? 0
  const [myFinishedCount, season] = await Promise.all([
    journeysFinishedThisSeason(profile.id),
    getCurrentSeason(),
  ])
  const myStandingRank = rankForCompletion(myFinishedCount)
  const standingHero = (
    <StandingHero
      zaps={myZaps}
      gems={myGems}
      streak={myStreak}
      rank={myStandingRank}
      journeysFinished={myFinishedCount}
      seasonName={season?.name}
      links={{ zaps: '/crew/leaderboard', rank: '/crew/achievements', streak: '/crew/streaks', gems: '/crew/store' }}
    />
  )

  const params = await searchParams
  const scope = params.scope ?? 'circle'

  // Entry-point recruiter board (ADR-134): different metrics (scans + signups + tier),
  // so it renders its own table rather than the season-zaps layout.
  if (scope === 'entrypoints') {
    const rows = await listEntryPointLeaderboard(50)
    const myIdx = rows.findIndex((r) => r.id === profile.id)
    const me = myIdx >= 0 ? rows[myIdx] : null
    const nextTier = me ? signupsToNextTier(me.signups) : null

    return (
      <IndexTemplate
        title="Leaderboard"
        description="Season rankings across your community. Compete with your circle, hub, nexus, or everyone."
        toolbar={<LeaderboardTabs activeScope={scope} />}
      >
        <div className="mb-6">{standingHero}</div>

        {me && (
          <div className="mb-4 rounded-xl bg-primary-bg/50 px-4 py-2.5 text-sm font-medium text-primary-strong">
            #{myIdx + 1} of {rows.length} · {me.tier.emoji} {me.tier.label} · {me.signups} signup{me.signups === 1 ? '' : 's'} from {me.scans} scan{me.scans === 1 ? '' : 's'}
            {nextTier && <span className="text-muted font-normal"> · {nextTier.remaining} more to {nextTier.next.label}</span>}
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState icon={Filter} title="No entry points yet." description="Crew who build entry points and drive signups show up here." />
        ) : (
          <div className="rounded-2xl bg-surface-elevated/40 px-2 py-1.5">
            <div className="grid grid-cols-[2.5rem_1fr_4.5rem_4rem_4.5rem_6.5rem] gap-2 px-3 py-2 text-xs font-medium text-subtle">
              <span>#</span>
              <span>Member</span>
              <span className="text-right">Points</span>
              <span className="text-right">Scans</span>
              <span className="text-right">Signups</span>
              <span className="text-right">Tier</span>
            </div>

            {rows.map((entry, i) => {
              const isSelf = entry.id === profile.id
              const medalColor = i < 3 ? 'text-primary' : 'text-subtle'
              return (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[2.5rem_1fr_4.5rem_4rem_4.5rem_6.5rem] gap-2 px-3 py-2.5 items-center rounded-lg ${isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : ''}`}
                >
                  <span className={`text-sm font-bold tabular-nums ${medalColor}`}>{i + 1}</span>
                  <Link href={`/people/${entry.handle}`} className="flex items-center gap-2 min-w-0">
                    {entry.avatarUrl ? (
                      <Image src={entry.avatarUrl} alt={entry.displayName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-xs font-bold flex items-center justify-center shrink-0">
                        {getInitials(entry.displayName)}
                      </div>
                    )}
                    <span className={`text-sm truncate ${isSelf ? 'font-semibold text-primary-strong' : 'text-text'}`}>
                      {entry.displayName}
                      {isSelf && <span className="text-xs font-normal text-primary-strong ml-1">(you)</span>}
                    </span>
                  </Link>
                  <span className="text-sm text-text text-right tabular-nums">{entry.entryPoints}</span>
                  <span className="text-sm text-text text-right tabular-nums flex items-center justify-end gap-0.5">
                    <QrCode className="w-3 h-3 text-subtle" />{entry.scans.toLocaleString()}
                  </span>
                  <span className="text-sm font-semibold text-text text-right tabular-nums flex items-center justify-end gap-0.5">
                    <UserPlus className="w-3 h-3 text-primary" />{entry.signups.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold leading-tight text-right" title={`${entry.tier.label} tier`}>
                    {entry.tier.emoji} {entry.tier.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </IndexTemplate>
    )
  }

  const limit = scope === 'global' ? 50 : scope === 'nexus' ? 30 : scope === 'hub' ? 20 : 10

  const { entries, scopeLabel } = await getLeaderboard(admin, scope, profile.id, limit)

  const myRank = entries.findIndex(e => e.id === profile.id)

  return (
    <IndexTemplate
      title="Leaderboard"
      description="Season rankings across your community. Compete with your circle, hub, nexus, or everyone."
      toolbar={<LeaderboardTabs activeScope={scope} />}
    >
      <div className="mb-6">{standingHero}</div>

      {myRank >= 0 && (
        <div className="mb-4 rounded-xl bg-primary-bg/50 px-4 py-2.5 flex items-center gap-2">
          <span className="text-sm font-medium text-primary-strong">
            Your rank: #{myRank + 1} of {entries.length} in {scopeLabel}
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No data for this scope yet." />
      ) : (
        <div className="rounded-2xl bg-surface-elevated/40 px-2 py-1.5">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem] gap-2 px-3 py-2 text-xs font-medium text-subtle">
            <span>#</span>
            <span>Member</span>
            <span className="text-right">{scope === 'gems' ? 'Gems' : 'Zaps'}</span>
            <span className="text-right">Streak</span>
            <span className="text-right">Badges</span>
            <span className="text-right">Rank</span>
          </div>

          {entries.map((entry, i) => {
            const isSelf = entry.id === profile.id
            const rankDef = getRankDef(entry.seasonRank)
            const medalColor = i === 0 ? 'text-primary' : i === 1 ? 'text-subtle' : i === 2 ? 'text-primary' : 'text-subtle'

            return (
              <div
                key={entry.id}
                className={`grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem] gap-2 px-3 py-2.5 items-center rounded-lg ${
                  isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : ''
                }`}
              >
                <span className={`text-sm font-bold tabular-nums ${medalColor}`}>{i + 1}</span>

                <Link href={`/people/${entry.handle}`} className="flex items-center gap-2 min-w-0">
                  {entry.avatarUrl ? (
                    <Image src={entry.avatarUrl} alt={entry.displayName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-xs font-bold flex items-center justify-center shrink-0">
                      {getInitials(entry.displayName)}
                    </div>
                  )}
                  <span className={`text-sm truncate ${isSelf ? 'font-semibold text-primary-strong' : 'text-text'}`}>
                    {entry.displayName}
                    {isSelf && <span className="text-xs font-normal text-primary-strong ml-1">(you)</span>}
                  </span>
                </Link>

                <span className="text-sm font-semibold text-text text-right tabular-nums flex items-center justify-end gap-0.5">
                  {scope === 'gems' ? (
                    <><Gem className="w-3 h-3 text-signal" />{entry.lifetimeGems.toLocaleString()}</>
                  ) : (
                    <><Zap className="w-3 h-3 text-primary" />{entry.seasonZaps.toLocaleString()}</>
                  )}
                </span>

                <span className="text-sm text-right tabular-nums">
                  {entry.streak > 0 ? (
                    <span className="text-primary font-semibold flex items-center justify-end gap-0.5">
                      <Flame className="w-3 h-3" />{entry.streak}
                    </span>
                  ) : (
                    <span className="text-subtle">-</span>
                  )}
                </span>

                <span className="text-sm text-right tabular-nums">
                  {entry.achievements > 0 ? (
                    <span className="text-signal font-medium flex items-center justify-end gap-0.5">
                      <Award className="w-3 h-3" />{entry.achievements}
                    </span>
                  ) : (
                    <span className="text-subtle">-</span>
                  )}
                </span>

                <span
                  className="rank-badge text-xs font-bold leading-tight"
                  style={seasonRankStyle(rankDef.rank)}
                >
                  {rankDef.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </IndexTemplate>
  )
}
