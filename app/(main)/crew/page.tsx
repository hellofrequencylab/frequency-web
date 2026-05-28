import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Star, CheckCircle, Zap, Award, Flame, Target, Map, TrendingUp, Gem, ShoppingBag } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SEASON_RANKS, getRankDef, type SeasonRank } from '@/lib/season-ranks'
import { CompleteButton } from './complete-button'
import { getInitials } from '@/lib/utils'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
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
    .select('id, display_name, handle, community_role, avatar_url, current_season_rank, current_season_zaps, season_challenges_complete, lifetime_gems')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes((profile as { community_role: string }).community_role ?? '')

  const currentSeasonZaps: number = (profile as { current_season_zaps: number }).current_season_zaps ?? 0
  const currentSeasonRank: SeasonRank = ((profile as { current_season_rank: string | null }).current_season_rank ?? 'ghost') as SeasonRank
  const challengesComplete: boolean = (profile as { season_challenges_complete: boolean }).season_challenges_complete ?? false
  const lifetimeGems: number = (profile as { lifetime_gems: number }).lifetime_gems ?? 0
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
          <h1 className="text-xl font-semibold text-text">Crew Dashboard</h1>
          {isCrewLead && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning-bg dark:bg-warning-bg text-warning font-semibold">
              Crew Lead
            </span>
          )}
        </div>
        <p className="text-sm text-muted mt-1">
          Track your contributions and season progress.
          {circleName && (
            <> You&apos;re in <span className="font-medium text-text">{circleName}</span>.</>
          )}
        </p>
      </div>

      {/* ── Season Progress (full width, top) ────────── */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-2.5 border-b border-border">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Season Progress</h3>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text">
              {currentSeasonRank === 'luminary'
                ? 'Maximum rank achieved'
                : currentSeasonRank === 'conduit' && !challengesComplete
                ? `Progress to Luminary`
                : nextRank
                ? `Progress to ${nextRank.label}`
                : 'Max rank'}
            </span>
            {nextRank && currentSeasonRank !== 'conduit' && (
              <span className="text-[11px] text-subtle">
                {currentSeasonZaps.toLocaleString()} / {nextRank.minZaps.toLocaleString()}
              </span>
            )}
          </div>

          <div className="h-2.5 rounded-full bg-surface-elevated overflow-hidden mb-4">
            <div
              className={`h-full rounded-full transition-all ${rankDef.color}`}
              style={{ width: `${rankProgress}%` }}
            />
          </div>

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
                        : 'bg-border-strong ring-transparent'
                    }`}
                  />
                  <span className={`text-[9px] font-semibold leading-none ${
                    isCurrent ? r.text : 'text-subtle'
                  }`}>
                    {r.label}
                  </span>
                </div>
              )
            })}
          </div>

          {currentSeasonRank === 'conduit' && !challengesComplete && (
            <p className="mt-3 text-[11px] text-subtle text-center">
              Complete all season challenges to unlock Luminary rank.
            </p>
          )}
        </div>
      </div>

      {/* ── Main content: left column (stats + tasks) + right column (quick links + leaderboard) */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* Left: stats tight above tasks */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* 4 stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Season Rank"
              value={rankDef.label}
              Icon={Star}
              colorCls="text-primary-strong bg-primary-bg dark:text-primary-strong"
            />
            <StatCard
              label="Zaps"
              value={currentSeasonZaps.toLocaleString()}
              Icon={Zap}
              colorCls="text-warning bg-warning-bg dark:text-primary"
            />
            <StatCard
              label="Gems"
              value={lifetimeGems.toLocaleString()}
              Icon={Gem}
              colorCls="text-signal-strong bg-success-bg dark:text-signal"
            />
            <StatCard
              label="Tasks Done"
              value={String(completedTaskCount)}
              Icon={CheckCircle}
              colorCls="text-success bg-success-bg dark:text-success"
            />
          </div>

          {/* Tasks */}
          <section>
            <h2 className="text-sm font-semibold text-text mb-3">
              Tasks
              <span className="ml-2 text-xs font-normal text-subtle">
                {(tasks ?? []).length} available
              </span>
            </h2>

            {(tasks ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 dark:border-border-strong/60 bg-surface/50 dark:bg-canvas/50 p-10 text-center">
                <Star className="w-7 h-7 text-subtle mx-auto mb-2" />
                <p className="text-sm text-subtle">No tasks available yet.</p>
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
                          ? 'border-success bg-success-bg/50 dark:bg-success-bg/30'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                        isDone ? 'bg-success-bg' : 'bg-surface-elevated'
                      }`}>
                        {isDone ? (
                          <CheckCircle className="w-4 h-4 text-success" />
                        ) : (
                          <Star className="w-4 h-4 text-subtle" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${
                            isDone ? 'text-success' : 'text-text'
                          }`}>
                            {task.name}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-elevated text-muted font-medium">
                            {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                          </span>
                          {task.is_repeatable && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-signal-bg text-signal-strong font-medium">
                              Repeatable
                            </span>
                          )}
                          {task.requires_verification && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-warning-bg text-warning dark:text-primary font-medium">
                              Needs review
                            </span>
                          )}
                        </div>

                        {isDone && lastCompletion && (
                          <p className="text-xs text-success mt-0.5">
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
                          <Zap className={`w-3.5 h-3.5 ${isDone ? 'text-success dark:text-success' : 'text-primary'}`} />
                          <span className={`text-sm font-semibold ${
                            isDone ? 'text-success' : 'text-muted'
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

        {/* Right: quick links + leaderboard */}
        <div className="lg:w-72 shrink-0 space-y-4">

          {/* 6 quick links */}
          <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/crew/achievements" Icon={Award} label="Achievements" sub="Earn badges" color="bg-signal-bg text-signal-strong" />
            <QuickLink href="/crew/streaks" Icon={Flame} label="Streaks" sub="Stay consistent" color="bg-warning-bg text-warning dark:text-primary" />
            <QuickLink href="/crew/challenges" Icon={Target} label="Challenges" sub="Season goals" color="bg-primary-bg text-primary-strong" />
            <QuickLink href="/crew/quests" Icon={Map} label="Quests" sub="Multi-step" color="bg-success-bg text-signal-strong" />
            <QuickLink href="/crew/leaderboard" Icon={TrendingUp} label="Leaderboard" sub="Rankings" color="bg-warning-bg text-warning" />
            <QuickLink href="/crew/store" Icon={ShoppingBag} label="Gem Store" sub="Spend gems" color="bg-teal-50 text-signal-strong" />
          </div>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <SidebarCard title={circleName ? `Leaderboard — ${circleName}` : 'Season Leaderboard'}>
              <div>
                {leaderboard.map((member, i) => {
                  const isSelf = member.profileId === profile.id
                  const memberRankDef = getRankDef(member.seasonRank)
                  const rankColor =
                    i === 0 ? 'text-primary'
                    : i === 1 ? 'text-subtle'
                    : i === 2 ? 'text-primary'
                    : 'text-subtle'

                  return (
                    <div
                      key={member.profileId}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        i < leaderboard.length - 1 ? 'border-b border-border' : ''
                      } ${isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : ''}`}
                    >
                      <span className={`text-sm font-bold w-5 shrink-0 ${rankColor}`}>{i + 1}</span>

                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt={member.displayName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                          {getInitials(member.displayName)}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/people/${member.handle}`}
                          className={`text-xs font-medium truncate hover:underline ${
                            isSelf ? 'text-primary-strong' : 'text-text'
                          }`}
                        >
                          {member.displayName}
                          {isSelf && <span className="ml-1 text-[11px] text-primary-strong dark:text-primary-strong font-normal">(you)</span>}
                        </Link>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${memberRankDef.color} text-white`}>
                          {memberRankDef.label}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Zap className="w-3 h-3 text-primary" />
                          <span className="text-xs font-semibold text-text">
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
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorCls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold text-text leading-none">{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  )
}

function QuickLink({ href, Icon, label, sub, color }: {
  href: string; Icon: React.ElementType; label: string; sub: string; color: string
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-surface shadow-sm p-3 hover:border-primary-bg dark:hover:border-primary transition-colors group"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color} transition-colors`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-sm font-semibold text-text leading-none">{label}</div>
      <div className="text-xs text-muted mt-0.5">{sub}</div>
    </Link>
  )
}
