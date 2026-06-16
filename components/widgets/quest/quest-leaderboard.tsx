import Image from 'next/image'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCrewContext } from '@/lib/quest/crew-context'
import { getRankDef, type SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'
import { ModuleCard } from '@/components/modules/module-card'

// My Quest layout module (ADR-270/294): the viewer's circle ranked by season Zaps (top 5).
// Self-fetching RSC keyed to the signed-in member; renders nothing when the viewer is not in a
// circle or the circle has no ranked members yet.
export async function QuestLeaderboard() {
  const ctx = await getCrewContext()
  if (!ctx?.membership?.circleId) return null
  const { profileId, membership } = ctx
  const admin = createAdminClient()

  const { data: circleMembers } = await admin
    .from('memberships')
    .select('profile_id')
    .eq('circle_id', membership.circleId)
    .eq('status', 'active')

  const memberIds = (circleMembers ?? []).map((m) => m.profile_id as string)
  if (memberIds.length === 0) return null

  const { data: profileData } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank')
    .in('id', memberIds)

  const leaderboard = (profileData ?? [])
    .map((p) => ({
      profileId: p.id,
      displayName: p.display_name,
      handle: p.handle,
      avatarUrl: p.avatar_url,
      seasonZaps: (p as { current_season_zaps: number }).current_season_zaps ?? 0,
      seasonRank: ((p as { current_season_rank: string | null }).current_season_rank ?? 'ghost') as SeasonRank,
    }))
    .sort((a, b) => b.seasonZaps - a.seasonZaps)
    .slice(0, 5)

  if (leaderboard.length === 0) return null

  return (
    <ModuleCard title={membership.circleName ? `Leaderboard · ${membership.circleName}` : 'Season leaderboard'}>
      <div className="space-y-0.5">
        {leaderboard.map((member, i) => {
          const isSelf = member.profileId === profileId
          const memberRankDef = getRankDef(member.seasonRank)
          const rankColor =
            i === 0 ? 'text-primary' : i === 1 ? 'text-subtle' : i === 2 ? 'text-primary' : 'text-subtle'

          return (
            <div
              key={member.profileId}
              className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 ${
                isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : ''
              }`}
            >
              <span className={`w-5 shrink-0 text-sm font-bold ${rankColor}`}>{i + 1}</span>

              {member.avatarUrl ? (
                <Image
                  src={member.avatarUrl}
                  alt={member.displayName}
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-primary-bg text-xs font-semibold text-primary-strong">
                  {getInitials(member.displayName)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <Link
                  href={`/people/${member.handle}`}
                  className={`truncate text-xs font-medium hover:underline ${
                    isSelf ? 'text-primary-strong' : 'text-text'
                  }`}
                >
                  {member.displayName}
                  {isSelf && <span className="ml-1 text-xs font-normal text-primary-strong">(you)</span>}
                </Link>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold text-white ${memberRankDef.color}`}>
                  {memberRankDef.label}
                </span>
                <div className="flex items-center gap-0.5">
                  <Zap className="h-3 w-3 text-primary" />
                  <span className="text-xs font-semibold text-text">{member.seasonZaps.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </ModuleCard>
  )
}
