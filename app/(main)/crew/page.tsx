import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Star, CheckCircle, Zap, Award, Flame, Target, Map, TrendingUp, ShoppingBag, CalendarDays, ArrowRight, Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getPracticesToLogToday } from '@/lib/practices'
import { getRankDef, rankForZaps, type SeasonRank } from '@/lib/season-ranks'
import { CompleteButton } from './complete-button'
import { getInitials } from '@/lib/utils'
import { getCurrentSeason } from '@/lib/seasons'
import { SeasonBanner } from './season-banner'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ModuleCard } from '@/components/modules/module-card'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { DashboardTemplate } from '@/components/templates'
import { StandingHero } from '@/components/gamification/standing-hero'
import { CircleTasksSection } from './circle-tasks-section'
import type { SupabaseClient } from '@supabase/supabase-js'

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
    .select('id, display_name, handle, community_role, avatar_url, current_season_rank, current_season_zaps, season_challenges_complete, lifetime_gems, current_streak, is_crew_lead')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const isCrew = await isPaidViewer()

  const currentSeasonZaps: number = (profile as { current_season_zaps: number }).current_season_zaps ?? 0
  // Derive the rank from the zaps total so a stale current_season_rank column
  // never shows the wrong tier (the stored value can lag behind awards).
  const currentSeasonRank: SeasonRank = rankForZaps(currentSeasonZaps)
  const challengesComplete: boolean = (profile as { season_challenges_complete: boolean }).season_challenges_complete ?? false
  const lifetimeGems: number = (profile as { lifetime_gems: number }).lifetime_gems ?? 0
  const currentStreak: number = (profile as { current_streak: number }).current_streak ?? 0

  // Active season for the member-facing banner. End date is preformatted here
  // (server) so the client banner has no locale/timezone hydration mismatch.
  const season = await getCurrentSeason()
  const seasonEndsLabel = season?.ends_at
    ? new Date(season.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  // Next-best-action: the one thing to do right now. Log today's practice (the
  // North-Star action) if any are unlogged; otherwise nudge toward a gathering.
  const practicesToLog = await getPracticesToLogToday(profile.id)
  const nextAction = practicesToLog.length > 0
    ? { title: 'Log today’s practice', desc: 'The one move that keeps your streak (and your circle) alive.', href: '/practices', label: 'Log it', Icon: Flame }
    : { title: 'Find your next gathering', desc: 'Showing up in person is where it gets real. See what your circles are running.', href: '/events', label: 'See events', Icon: CalendarDays }

  // Available GLOBAL catalogue tasks (circle_id IS NULL). Circle-scoped tasks
  // render in their own claim-aware section below. Untyped handle: circle_id
  // isn't in database.types yet (repo convention; see lib/crew/circle-tasks.ts).
  const { data: tasksData } = await (admin as unknown as SupabaseClient)
    .from('crew_tasks')
    .select('id, name, task_type, zaps_value, is_repeatable, requires_verification')
    .is('circle_id', null)
    .order('zaps_value', { ascending: false })
  const tasks = (tasksData ?? []) as Array<{
    id: string
    name: string
    task_type: string
    zaps_value: number
    is_repeatable: boolean | null
    requires_verification: boolean | null
  }>

  // My completions (all-time, for task state)
  const { data: completions } = await admin
    .from('crew_completions')
    .select('id, task_id, zaps_earned, completed_at, verified_by')
    .eq('profile_id', profile.id)
    .order('completed_at', { ascending: false })

  const completionsByTask: Record<string, typeof completions> = {}
  ;(completions ?? []).forEach((c) => {
    if (!c.task_id) return
    if (!completionsByTask[c.task_id]) completionsByTask[c.task_id] = []
    completionsByTask[c.task_id]!.push(c)
  })

  // My first active circle membership
  const { data: membership } = await admin
    .from('memberships')
    .select(`circle_id, circle:circles!circle_id ( id, name, slug )`)
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  // Season leaderboard. Top 5 in same circle by current_season_zaps
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

  const circleName = (membership?.circle as { name: string } | null)?.name ?? null
  const isCrewLead = profile.is_crew_lead ?? false

  return (
    <>
      {!isCrew && <CrewPreviewBanner />}
      <DashboardTemplate
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Crew Dashboard
            {isCrewLead && (
              <span className="rounded-md bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                Crew Lead
              </span>
            )}
          </span>
        }
        description={
          <>
            Your contributions and season progress. Keep showing up and the rank comes with it.
            {circleName && (
              <> You&apos;re in <span className="font-medium text-text">{circleName}</span>.</>
            )}
          </>
        }
      >
        {/* ── The standing hero — rank crest, the four gamified counts, the climb
            ladder. The member dashboard's centerpiece (redesign foundation). ── */}
        <StandingHero
          zaps={currentSeasonZaps}
          gems={lifetimeGems}
          streak={currentStreak}
          rank={currentSeasonRank}
          seasonName={season?.name}
          links={{
            zaps: '/crew/leaderboard',
            rank: '/crew/achievements',
            streak: '/crew/streaks',
            gems: '/crew/store',
          }}
        />

        {/* ── Season banner + live countdown ──────────── */}
        {season && (
        <SeasonBanner
          seasonNumber={season.season_number}
          name={season.name}
          theme={season.theme}
          endsAt={season.ends_at}
          endsLabel={seasonEndsLabel}
        />
      )}

      {/* ── Next best action — the one thing to do right now ── */}
      <Link
        href={nextAction.href}
        className="flex items-center gap-4 rounded-2xl border border-primary-bg bg-primary-bg/40 dark:bg-primary-bg/15 p-5 transition-colors hover:bg-primary-bg/60 dark:hover:bg-primary-bg/25"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
          <nextAction.Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-subtle">Next step</p>
          <p className="text-base font-bold leading-tight text-text">{nextAction.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{nextAction.desc}</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary sm:inline-flex">
          {nextAction.label}<ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      {/* Your Journey — the active-journey progress tab (practices + their rewards). */}
      <Link
        href="/crew/journey"
        className="flex items-center gap-4 rounded-2xl bg-surface-elevated/60 p-5 transition-colors hover:bg-surface-elevated"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-signal-bg text-signal-strong">
          <Compass className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-subtle">Your Journey</p>
          <p className="text-base font-bold leading-tight text-text">Track your season&rsquo;s practices</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            Your progress across Mind &middot; Body &middot; Spirit &middot; Expression, and the next step to log.
          </p>
        </div>
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-subtle sm:block" />
      </Link>

      {/* The standing ladder lives in the hero now; the one rule it can't show is
          the Luminary challenge gate, so keep that nudge when it applies. */}
      {currentSeasonRank === 'conduit' && !challengesComplete && (
        <p className="flex items-center gap-2 rounded-2xl bg-surface-elevated/60 px-5 py-3 text-sm text-muted">
          <Target className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Complete all season challenges to unlock <span className="font-semibold text-text">Luminary</span> rank.
        </p>
      )}

      {/* ── Main content: left column (tasks) + right column (quick links + leaderboard) */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* Left: tasks */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Circle tasks — host-assigned, claimable (renders nothing when the
              viewer's circle has none). */}
          {membership?.circle_id && (
            <CircleTasksSection
              circleId={membership.circle_id}
              circleName={circleName}
              viewerProfileId={profile.id}
              isCrew={isCrew}
            />
          )}

          {/* Tasks */}
          <section>
            <SectionHeader title="Tasks" count={(tasks ?? []).length} />

            {(tasks ?? []).length === 0 ? (
              <EmptyState icon={Star} title="No tasks available yet." />
            ) : (
              <div className="space-y-1.5">
                {(tasks ?? []).map((task) => {
                  const myCompletions = completionsByTask[task.id] ?? []
                  const isDone = myCompletions.length > 0
                  const lastCompletion = myCompletions[0]
                  const isVerified = lastCompletion?.verified_by != null

                  return (
                    <div
                      key={task.id}
                      className={`rounded-2xl px-4 py-3 flex items-start gap-3 transition-colors ${
                        isDone
                          ? 'bg-success-bg/40'
                          : 'bg-surface-elevated/60'
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
                          <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
                            {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                          </span>
                          {task.is_repeatable && (
                            <span className="text-xs px-1.5 py-0.5 rounded-md bg-signal-bg text-signal-strong font-medium">
                              Repeatable
                            </span>
                          )}
                          {task.requires_verification && (
                            <span className="text-xs px-1.5 py-0.5 rounded-md bg-warning-bg text-warning dark:text-primary font-medium">
                              Needs review
                            </span>
                          )}
                        </div>

                        {isDone && lastCompletion?.completed_at && (
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
        <div className="lg:w-72 shrink-0 space-y-6">

          {/* 6 quick links */}
          <section>
            <SectionHeader title="Explore" />
            <div className="grid grid-cols-2 gap-2">
            <QuickLink href="/crew/achievements" Icon={Award} label="Achievements" sub="Earn badges" color="bg-signal-bg text-signal-strong" />
            <QuickLink href="/crew/streaks" Icon={Flame} label="Streaks" sub="Stay consistent" color="bg-warning-bg text-warning dark:text-primary" />
            <QuickLink href="/crew/challenges" Icon={Target} label="Challenges" sub="Season goals" color="bg-primary-bg text-primary-strong" />
            <QuickLink href="/journeys" Icon={Map} label="Journeys" sub="Sets of practices" color="bg-broadcast-bg text-broadcast-strong" />
            <QuickLink href="/crew/leaderboard" Icon={TrendingUp} label="Leaderboard" sub="Rankings" color="bg-warning-bg text-warning" />
            <QuickLink href="/crew/store" Icon={ShoppingBag} label="Gem Store" sub="Spend gems" color="bg-signal-bg text-signal-strong" />
            </div>
          </section>

          {/* Leaderboard — borderless module. */}
          {leaderboard.length > 0 && (
            <ModuleCard title={circleName ? `Leaderboard · ${circleName}` : 'Season leaderboard'}>
              <div className="space-y-0.5">
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
                      className={`flex items-center gap-3 rounded-lg px-2 -mx-2 py-2 ${
                        isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : ''
                      }`}
                    >
                      <span className={`text-sm font-bold w-5 shrink-0 ${rankColor}`}>{i + 1}</span>

                      {member.avatarUrl ? (
                        <Image src={member.avatarUrl} alt={member.displayName} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
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
                          {isSelf && <span className="ml-1 text-xs text-primary-strong dark:text-primary-strong font-normal">(you)</span>}
                        </Link>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${memberRankDef.color} text-white`}>
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
            </ModuleCard>
          )}
        </div>
      </div>
      </DashboardTemplate>
    </>
  )
}

function QuickLink({ href, Icon, label, sub, color }: {
  href: string; Icon: React.ElementType; label: string; sub: string; color: string
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl bg-surface-elevated/60 p-3 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-sm font-semibold text-text leading-none">{label}</div>
      <div className="text-xs text-muted mt-0.5">{sub}</div>
    </Link>
  )
}
