import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Star, CheckCircle, Zap, Award, Flame, Target, Map, TrendingUp } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SEASON_RANKS, getRankDef, type SeasonRank } from '@/lib/season-ranks'
import { CompleteButton } from './complete-button'
import { getInitials } from '@/lib/utils'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-800/50">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h3>
      </div>
      {children}
    </div>
  )
}

const TASK_TYPE_LABEL: Record<string, string> = {
  attendance:   'Attendance',
  hosting:      'Hosting',
  volunteering: 'Volunteering',
  content:      'Content',
  referral:     'Referral',
  other:        'Other',
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CrewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name, handle, community_role, avatar_url, current_season_rank, current_season_zaps, season_challenges_complete')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes((profile as { community_role: string }).community_role ?? '')

  const currentSeasonZaps: number = (profile as { current_season_zaps: number }).current_season_zaps ?? 0
  const currentSeasonRank: SeasonRank = ((profile as { current_season_rank: string | null }).current_season_rank ?? 'ghost') as SeasonRank
  const challengesComplete: boolean = (profile as { season_challenges_complete: boolean }).season_challenges_complete ?? false
  const rankDef = getRankDef(currentSeasonRank)

  // Next rank for progress bar
  const rankIdx  = SEASON_RANKS.findIndex(r => r.rank === currentSeasonRank)
  const nextRank = rankIdx < SEASON_RANKS.length - 1 ? SEASON_RANKS[rankIdx + 1] : null
  const rankProgress = nextRank
    ? Math.min(100, Math.round(
        ((currentSeasonZaps - rankDef.minZaps) / (nextRank.minZaps - rankDef.minZaps)) * 100
      ))
    : 100

  // Available tasks
  const { data: tasks } = await admin
    .from('crew_tasks')
    .select('id, name, task_type, zaps_value, is_repeatable, requires_verification')
    .order('zaps_value', { ascending: false })

  // My completions (all-time, for task state)
  const { data: completions } = await admin
    .from('crew_completions')
    .select('id, task_id, zaps_earned, completed_at, verified_by')
    .eq('profile_id', profile.id)
    .order('completed_at', { ascending: false })

  const completionsByTask: Record<string, typeof completions> = {}
  ;(completions ?? []).forEach((c) => {
    if (!completionsByTask[c.task_id]) completionsByTask[c.task_id] = []
    completionsByTask[c.task_id]!.push(c)
  })

  const completedTaskCount = new Set((completions ?? []).map((c) => c.task_id)).size

  // My first active circle membership
  const { data: membership } = await admin
    .from('memberships')
    .select(`circle_id, is_crew_lead, circle:circles!circle_id ( id, name, slug )`)
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  // Season leaderboard — top 5 in same circle by current_season_zaps
  let leaderboard: Array<{
    profileId: string
    displayName: string
    handle: string
    avatarUrl: string | null
    seasonZaps: number
    seasonRank: SeasonRank
  }> = []

  if (membership?.circle_id) {
    const { data: circleMembers } = await admin
      .from('memberships')
      .select('profile_id')
      .eq('circle_id', membership.circle_id)
      .eq('status', 'active')

    const memberIds = (circleMembers ?? []).map((m) => m.profile_id as string)

    if (memberIds.length > 0) {
      const { data: profileData } = await admin
        .from('profiles')
        .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank')
        .in('id', memberIds)

      leaderboard = (profileData ?? [])
        .map((p) => ({
          profileId:   p.id,
          displayName: p.display_name,
          handle:      p.handle,
          avatarUrl:   p.avatar_url,
          seasonZaps:  (p as { current_season_zaps: number }).current_season_zaps ?? 0,
          seasonRank:  ((p as { current_season_rank: string | null }).current_season_rank ?? 'ghost') as SeasonRank,
        }))
        .sort((a, b) => b.seasonZaps - a.seasonZaps)
        .slice(0, 5)
    }
  }

  const circleName = (membership as { circle: { name: string } | null } | null)?.circle?.name ?? null
  const isCrewLead = (membership as { is_crew_lead: boolean } | null)?.is_crew_lead ?? false

  return (
    <div>
      {/* ── Header ──────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Crew Dashboard</h1>
          {isCrewLead && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">
              Crew Lead
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Track your contributions and season progress.
          {circleName && (
            <> You&apos;re in <span className="font-medium text-gray-700 dark:text-gray-300">{circleName}</span>.</>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Stats + Tasks ──────────────────────── */}
        <div className="lg:col-span-2">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard
              label="Zaps"
              value={currentSeasonZaps.toLocaleString()}
              Icon={Zap}
              colorCls="text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400"
            />
            <StatCard
              label="Tasks Done"
              value={String(completedTaskCount)}
              Icon={CheckCircle}
              colorCls="text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400"
            />
            <StatCard
              label="Season Rank"
              value={rankDef.label}
              Icon={Star}
              colorCls="text-indigo-600 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400"
            />
          </div>

          {/* ── Gamification quick links ─────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Link
              href="/crew/achievements"
              className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 group-hover:bg-violet-100 dark:group-hover:bg-violet-900 transition-colors">
                <Award className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-50 leading-none">Achievements</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Earn badges</div>
            </Link>
            <Link
              href="/crew/streaks"
              className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 group-hover:bg-orange-100 dark:group-hover:bg-orange-900 transition-colors">
                <Flame className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-50 leading-none">Streaks</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Stay consistent</div>
            </Link>
            <Link
              href="/crew/challenges"
              className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900 transition-colors">
                <Target className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-50 leading-none">Challenges</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Season goals</div>
            </Link>
            <Link
              href="/crew/quests"
              className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900 transition-colors">
                <Map className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-50 leading-none">Quests</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Multi-step journeys</div>
            </Link>
          </div>

          {/* ── Tasks ────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Tasks
              <span className="ml-2 text-xs font-normal text-gray-400">
                {(tasks ?? []).length} available
              </span>
            </h2>

            {(tasks ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-900/50 p-10 text-center">
                <Star className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No tasks available yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(tasks ?? []).map((task) => {
                  const myCompletions = completionsByTask[task.id] ?? []
                  const isDone = myCompletions.length > 0
                  const lastCompletion = myCompletions[0]
                  const isVerified = lastCompletion?.verified_by != null

                  return (
                    <div
                      key={task.id}
                      className={`rounded-2xl border px-4 py-3 flex items-start gap-3 shadow-sm transition-colors ${
                        isDone
                          ? 'border-green-100 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30'
                          : 'border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900'
                      }`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                        isDone ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-50 dark:bg-gray-800'
                      }`}>
                        {isDone ? (
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <Star className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${
                            isDone ? 'text-green-800 dark:text-green-300' : 'text-gray-900 dark:text-gray-50'
                          }`}>
                            {task.name}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                            {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                          </span>
                          {task.is_repeatable && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium">
                              Repeatable
                            </span>
                          )}
                          {task.requires_verification && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 font-medium">
                              Needs review
                            </span>
                          )}
                        </div>

                        {isDone && lastCompletion && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                            Completed{' '}
                            {new Date(lastCompletion.completed_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                            {isVerified
                              ? ' · Verified'
                              : task.requires_verification
                              ? ' · Pending verification'
                              : ''}
                            {myCompletions.length > 1 ? ` · ${myCompletions.length}x` : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-0.5">
                          <Zap className={`w-3.5 h-3.5 ${isDone ? 'text-green-500 dark:text-green-400' : 'text-amber-400'}`} />
                          <span className={`text-sm font-semibold ${
                            isDone ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            +{(task as { zaps_value: number }).zaps_value}
                          </span>
                        </div>
                        <CompleteButton
                          taskId={task.id}
                          isDone={isDone}
                          isRepeatable={task.is_repeatable ?? false}
                          requiresVerification={task.requires_verification ?? false}
                          isCrew={isCrew}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Sidebar: rank progress + leaderboard ────────── */}
        <div className="space-y-4">

          {/* Season rank progression */}
          <SidebarCard title="Season Progress">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {currentSeasonRank === 'luminary'
                    ? 'Maximum rank achieved'
                    : currentSeasonRank === 'conduit' && !challengesComplete
                    ? `Progress to Luminary`
                    : nextRank
                    ? `Progress to ${nextRank.label}`
                    : 'Max rank'}
                </span>
                {nextRank && currentSeasonRank !== 'conduit' && (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {currentSeasonZaps.toLocaleString()} / {nextRank.minZaps.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all ${rankDef.color}`}
                  style={{ width: `${rankProgress}%` }}
                />
              </div>

              {/* Rank milestones */}
              <div className="flex justify-between">
                {SEASON_RANKS.map((r) => {
                  const achieved = currentSeasonZaps >= r.minZaps &&
                    (r.rank !== 'luminary' || challengesComplete)
                  const isCurrent = r.rank === currentSeasonRank
                  return (
                    <div key={r.rank} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ring-2 transition-all ${
                          isCurrent
                            ? `${r.color} ring-current ring-offset-1`
                            : achieved
                            ? `${r.color} ring-transparent`
                            : 'bg-gray-200 dark:bg-gray-700 ring-transparent'
                        }`}
                      />
                      <span className={`text-[9px] font-semibold leading-none ${
                        isCurrent ? r.text : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {r.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Luminary gate note */}
              {currentSeasonRank === 'conduit' && !challengesComplete && (
                <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 text-center">
                  Complete all season challenges to unlock Luminary rank.
                </p>
              )}
            </div>
          </SidebarCard>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <SidebarCard title={circleName ? `Leaderboard — ${circleName}` : 'Season Leaderboard'}>
              <div>
                {leaderboard.map((member, i) => {
                  const isSelf = member.profileId === profile.id
                  const memberRankDef = getRankDef(member.seasonRank)
                  const rankColor =
                    i === 0 ? 'text-amber-500'
                    : i === 1 ? 'text-gray-400'
                    : i === 2 ? 'text-orange-400'
                    : 'text-gray-300 dark:text-gray-600'

                  return (
                    <div
                      key={member.profileId}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        i < leaderboard.length - 1 ? 'border-b border-gray-100/80 dark:border-gray-800/50' : ''
                      } ${isSelf ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''}`}
                    >
                      <span className={`text-sm font-bold w-5 shrink-0 ${rankColor}`}>{i + 1}</span>

                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt={member.displayName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                          {getInitials(member.displayName)}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/people/${member.handle}`}
                          className={`text-xs font-medium truncate hover:underline ${
                            isSelf ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-50'
                          }`}
                        >
                          {member.displayName}
                          {isSelf && <span className="ml-1 text-[11px] text-indigo-400 dark:text-indigo-500 font-normal">(you)</span>}
                        </Link>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${memberRankDef.color} text-white`}>
                          {memberRankDef.label}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {member.seasonZaps.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SidebarCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, Icon, colorCls,
}: {
  label:    string
  value:    string
  Icon:     React.ElementType
  colorCls: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorCls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-gray-50 leading-none">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
