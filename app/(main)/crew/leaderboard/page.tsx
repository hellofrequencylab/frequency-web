import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Zap, TrendingUp, Award, Flame, Gem } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getRankDef, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'
import { LeaderboardTabs } from './leaderboard-tabs'

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

    const circleIds = (myMemberships ?? []).map((m: any) => m.circle_id as string)

    if (scope === 'circle') {
      if (circleIds.length === 0) return { entries: [], scopeLabel: 'My Circle' }
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', circleIds)
        .eq('status', 'active')
      memberIds = [...new Set((members ?? []).map((m: any) => m.profile_id as string))]
      scopeLabel = 'My Circle'
    } else if (scope === 'hub') {
      const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
      const hubIds = [...new Set((circles ?? []).map((c: any) => c.hub_id).filter(Boolean))]
      if (hubIds.length === 0) return { entries: [], scopeLabel: 'My Hub' }

      const { data: hubCircles } = await admin.from('circles').select('id').in('hub_id', hubIds)
      const allCircleIds = (hubCircles ?? []).map((c: any) => c.id as string)
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', allCircleIds)
        .eq('status', 'active')
      memberIds = [...new Set((members ?? []).map((m: any) => m.profile_id as string))]
      scopeLabel = 'My Hub'
    } else if (scope === 'nexus') {
      const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
      const hubIds = [...new Set((circles ?? []).map((c: any) => c.hub_id).filter(Boolean))]
      if (hubIds.length === 0) return { entries: [], scopeLabel: 'My Nexus' }

      const { data: hubs } = await admin.from('hubs').select('nexus_id').in('id', hubIds)
      const nexusIds = [...new Set((hubs ?? []).map((h: any) => h.nexus_id).filter(Boolean))]
      if (nexusIds.length === 0) return { entries: [], scopeLabel: 'My Nexus' }

      const { data: nexusHubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
      const allHubIds = (nexusHubs ?? []).map((h: any) => h.id as string)
      const { data: nexusCircles } = await admin.from('circles').select('id').in('hub_id', allHubIds)
      const allCircleIds = (nexusCircles ?? []).map((c: any) => c.id as string)
      const { data: members } = await admin
        .from('memberships')
        .select('profile_id')
        .in('circle_id', allCircleIds)
        .eq('status', 'active')
      memberIds = [...new Set((members ?? []).map((m: any) => m.profile_id as string))]
      scopeLabel = 'My Nexus'
    }
  }

  const isGemsScope = scope === 'gems'
  const orderCol = isGemsScope ? 'lifetime_gems' : 'current_season_zaps'

  let query = admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank, current_streak, achievement_count, lifetime_gems')
    .eq('is_active', true)
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

  const entries: LeaderboardEntry[] = (profiles ?? []).map((p: any) => ({
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
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  const params = await searchParams
  const scope = params.scope ?? 'circle'
  const limit = scope === 'global' ? 50 : scope === 'nexus' ? 30 : scope === 'hub' ? 20 : 10

  const { entries, scopeLabel } = await getLeaderboard(admin, scope, profile.id, limit)

  const myRank = entries.findIndex(e => e.id === profile.id)

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link href="/crew" className="text-sm text-subtle hover:text-muted dark:hover:text-subtle transition-colors">Crew</Link>
          <span className="text-subtle">/</span>
          <h1 className="text-xl font-semibold text-text">Leaderboard</h1>
        </div>
        <p className="text-sm text-muted mt-1">
          Season rankings across your community. Compete with your circle, hub, nexus, or everyone.
        </p>
      </div>

      <LeaderboardTabs activeScope={scope} />

      {myRank >= 0 && (
        <div className="mb-4 rounded-xl border border-primary-bg/60 dark:border-primary/40 bg-primary-bg/50 dark:bg-primary-bg px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs font-medium text-primary-strong">
            Your rank: #{myRank + 1} of {entries.length} in {scopeLabel}
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 dark:border-border-strong/60 bg-surface/50 dark:bg-canvas/50 p-10 text-center">
          <TrendingUp className="w-7 h-7 text-subtle mx-auto mb-2" />
          <p className="text-sm text-subtle">No data for this scope yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem] gap-2 px-4 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-subtle">
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
                className={`grid grid-cols-[2.5rem_1fr_5rem_4rem_4rem_5rem] gap-2 px-4 py-2.5 items-center border-b border-border dark:border-border/30 last:border-0 ${
                  isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : ''
                }`}
              >
                <span className={`text-sm font-bold tabular-nums ${medalColor}`}>{i + 1}</span>

                <Link href={`/people/${entry.handle}`} className="flex items-center gap-2 min-w-0">
                  {entry.avatarUrl ? (
                    <Image src={entry.avatarUrl} alt={entry.displayName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-[10px] font-bold flex items-center justify-center shrink-0">
                      {getInitials(entry.displayName)}
                    </div>
                  )}
                  <span className={`text-sm truncate ${isSelf ? 'font-semibold text-primary-strong' : 'text-text'}`}>
                    {entry.displayName}
                    {isSelf && <span className="text-[11px] font-normal text-primary-strong ml-1">(you)</span>}
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
                  className="rank-badge text-[10px] font-bold leading-tight"
                  style={seasonRankStyle(rankDef.rank)}
                >
                  {rankDef.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
