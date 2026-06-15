import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import {
  Star, CheckCircle, Zap, Award, Flame, Map as MapIcon, TrendingUp, ShoppingBag,
  ArrowRight, Target, Compass, Sparkles,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getPracticesToLogToday } from '@/lib/practices'
import {
  getRankDef, rankForCompletion, journeysFinishedThisSeason, type SeasonRank,
} from '@/lib/season-ranks'
import { CompleteButton } from './complete-button'
import { getInitials } from '@/lib/utils'
import { getCurrentSeason, type Season } from '@/lib/seasons'
import { journeyPracticeIds, distinctPracticeDaysInWindow } from '@/lib/quest/completion'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ModuleCard } from '@/components/modules/module-card'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { DashboardTemplate } from '@/components/templates'
import { SeasonMap, type SeasonMapJourney } from '@/components/quest/season-map'
import { CircleTasksSection } from './circle-tasks-section'
import { Skeleton } from '@/components/ui/skeleton'

const TASK_TYPE_LABEL: Record<string, string> = {
  attendance:   'Attendance',
  hosting:      'Hosting',
  volunteering: 'Volunteering',
  content:      'Content',
  referral:     'Referral',
  other:        'Other',
}

const DAYS_TO_FINISH = 14
const PILLAR_LABEL: Record<string, 'Mind' | 'Body' | 'Spirit'> = {
  mind: 'Mind', body: 'Body', spirit: 'Spirit',
}
const PILLAR_ORDER: Record<string, number> = { mind: 0, body: 1, spirit: 2 }

// ── The season map data read ─────────────────────────────────────────────────
// The three official Journeys of the active Quest (Mind → Body → Spirit) with each
// one's completion state. Self-contained read composing the completion helpers; the
// `quests`/`journey_plans` columns aren't in the generated types yet, so it reads
// through the admin handle behind a try/catch and degrades to an empty hero.

interface JourneyArc extends SeasonMapJourney {
  /** Resolved Journey id (for the Expression-only next-step branch). */
  journeyId: string
}

interface SeasonMapData {
  journeys: JourneyArc[]
  /** The Journey to act on now: in-window, else the next upcoming, else the last. */
  current: JourneyArc | null
  /** That Journey's Expression Challenge is the last thing left to finish it. */
  currentExpressionPending: boolean
}

interface OfficialJourneyRow {
  id: string
  slug: string
  title: string
  emoji: string | null
  window_starts_at: string | null
  window_ends_at: string | null
  pillarSlug: string | null
}

async function readSeasonMap(profileId: string, season: Season | null): Promise<SeasonMapData> {
  const empty: SeasonMapData = { journeys: [], current: null, currentExpressionPending: false }
  if (!season) return empty

  try {
    const admin = createAdminClient()

    // Active Quest(s) for this season → their official Journeys, with each Journey's
    // Pillar (the first practice item's domain) for the arc label.
    const { data: questRows } = await admin
      .from('quests')
      .select('id')
      .eq('status', 'active')
    const questIds = ((questRows ?? []) as { id: string }[]).map((q) => q.id)
    if (questIds.length === 0) return empty

    const { data: planRows } = await admin
      .from('journey_plans')
      .select('id, slug, title, emoji, window_starts_at, window_ends_at, journey_plan_items(domain_id)')
      .in('quest_id', questIds)
      .eq('official', true)
    const plans = (planRows ?? []) as Array<{
      id: string; slug: string; title: string; emoji: string | null
      window_starts_at: string | null; window_ends_at: string | null
      journey_plan_items: { domain_id: string | null }[] | null
    }>
    if (plans.length === 0) return empty

    // Map each Journey's domain_id → its Pillar slug (mind/body/spirit).
    const domainIds = [...new Set(
      plans.flatMap((p) => (p.journey_plan_items ?? []).map((i) => i.domain_id).filter(Boolean) as string[]),
    )]
    const slugByDomain = new Map<string, string>() // domainId → pillar slug
    if (domainIds.length > 0) {
      const { data: pillarRows } = await admin
        .from('pillars')
        .select('id, slug')
        .in('id', domainIds)
      for (const r of (pillarRows ?? []) as { id: string; slug: string }[]) {
        slugByDomain.set(r.id, r.slug)
      }
    }

    const rows: OfficialJourneyRow[] = plans.map((p) => {
      const firstDomain = (p.journey_plan_items ?? []).find((i) => i.domain_id)?.domain_id ?? null
      return {
        id: p.id, slug: p.slug, title: p.title, emoji: p.emoji,
        window_starts_at: p.window_starts_at, window_ends_at: p.window_ends_at,
        pillarSlug: firstDomain ? (slugByDomain.get(firstDomain) ?? null) : null,
      }
    })

    // Keep only the three Pillar Journeys (a Quest ships exactly Mind/Body/Spirit),
    // ordered Mind → Body → Spirit.
    const pillarRowsOnly = rows
      .filter((r) => r.pillarSlug && PILLAR_LABEL[r.pillarSlug])
      .sort((a, b) => (PILLAR_ORDER[a.pillarSlug!] ?? 9) - (PILLAR_ORDER[b.pillarSlug!] ?? 9))
    if (pillarRowsOnly.length === 0) return empty

    // Which Journeys are already finished this season (a journey_completions row).
    const { data: doneRows } = await admin
      .from('journey_completions')
      .select('journey_id')
      .eq('profile_id', profileId)
      .eq('season', season.season_number)
    const doneIds = new Set(((doneRows ?? []) as { journey_id: string }[]).map((r) => r.journey_id))

    // Per-Journey Expression Challenge state — the 4th Pillar's capstone on each Journey.
    // Each Journey's Expression Challenge is the season_challenges row with journey_id =
    // <plan id>; done = a challenge_progress row with a completed_at for the member. Two
    // batched reads (challenges for these plans, then this member's progress on them) so
    // the map can mark every arc's capstone. A finished Journey implies its Expression
    // Challenge is done. Stays behind the page's <Suspense>.
    const planIds = pillarRowsOnly.map((r) => r.id)
    const { data: challengeRows } = await admin
      .from('season_challenges')
      .select('id, journey_id')
      .eq('season', season.season_number)
      .in('journey_id', planIds)
    const challenges = ((challengeRows ?? []) as { id: string; journey_id: string | null }[])
      .filter((c): c is { id: string; journey_id: string } => !!c.journey_id)
    const challengeByJourney = new Map(challenges.map((c) => [c.journey_id, c.id]))

    let completedChallengeIds = new Set<string>()
    if (challenges.length > 0) {
      const { data: progressRows } = await admin
        .from('challenge_progress')
        .select('challenge_id, completed_at')
        .eq('profile_id', profileId)
        .in('challenge_id', challenges.map((c) => c.id))
      completedChallengeIds = new Set(
        ((progressRows ?? []) as { challenge_id: string; completed_at: string | null }[])
          .filter((p) => !!p.completed_at)
          .map((p) => p.challenge_id),
      )
    }
    const expressionDoneFor = (journeyId: string): boolean => {
      if (doneIds.has(journeyId)) return true // a finished Journey cleared its capstone
      const challengeId = challengeByJourney.get(journeyId)
      return !!challengeId && completedChallengeIds.has(challengeId)
    }

    const today = new Date()
    const inWindow = (r: OfficialJourneyRow) => {
      const start = r.window_starts_at ? new Date(r.window_starts_at) : null
      const end = r.window_ends_at ? new Date(r.window_ends_at) : null
      return (!start || today >= start) && (!end || today <= end)
    }

    // The current Journey: the one whose window is open now; else the next one to open;
    // else the last (season's tail). Distinct days only matter for the open one.
    const openRow = pillarRowsOnly.find((r) => !doneIds.has(r.id) && inWindow(r))
    const upcomingRow = pillarRowsOnly.find(
      (r) => !doneIds.has(r.id) && r.window_starts_at && new Date(r.window_starts_at) > today,
    )
    const currentRow = openRow ?? upcomingRow ?? pillarRowsOnly[pillarRowsOnly.length - 1]

    // Days logged toward the bar — only the open current Journey needs the count. Once
    // the 14 days are met, the only thing left is the Expression Challenge; read its
    // state from the batched capstone map above (no extra round-trip).
    let currentDays = 0
    let currentExpressionPending = false
    if (openRow) {
      const practiceIds = await journeyPracticeIds(openRow.id)
      currentDays = await distinctPracticeDaysInWindow(
        profileId, practiceIds, openRow.window_starts_at, openRow.window_ends_at,
      )
      if (currentDays >= DAYS_TO_FINISH) {
        currentExpressionPending = !expressionDoneFor(openRow.id)
      }
    }

    const journeys: JourneyArc[] = pillarRowsOnly.map((r) => {
      const isDone = doneIds.has(r.id)
      const isCurrent = !isDone && !!openRow && openRow.id === r.id
      return {
        journeyId: r.id,
        slug: r.slug,
        title: r.title,
        pillar: PILLAR_LABEL[r.pillarSlug!],
        emoji: r.emoji,
        state: isDone ? 'done' : isCurrent ? 'current' : 'upcoming',
        daysLogged: isCurrent ? currentDays : 0,
        daysNeeded: DAYS_TO_FINISH,
        expression: expressionDoneFor(r.id) ? 'done' : 'pending',
      }
    })

    const current = currentRow
      ? journeys.find((j) => j.journeyId === currentRow.id) ?? null
      : null

    return { journeys, current, currentExpressionPending }
  } catch {
    return empty
  }
}

// Whole weeks left in the 13-week Quest (rounded up; never negative).
function weeksLeft(season: Season | null): number | null {
  if (!season?.ends_at) return null
  const ms = new Date(season.ends_at).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))
}

// ── The hero — the glanceable Quest standing + one next step + one action ─────
// Its own async unit so the per-Journey completion read can stream behind <Suspense>
// without blocking the shell (PAGE-FRAMEWORK §5).
async function QuestHero({
  profileId,
  season,
  finishedCount,
  rank,
  hasPracticeToLog,
}: {
  profileId: string
  season: Season | null
  finishedCount: number
  rank: SeasonRank
  hasPracticeToLog: boolean
}) {
  const map = await readSeasonMap(profileId, season)
  const current = map.current

  // The one time-aware next step. Default: keep going on the current Journey (N of 14
  // distinct days). If the only thing left to finish it is the Expression Challenge,
  // point there. Endowed-progress framing — credit days already done.
  const expressionNext = !!current && map.currentExpressionPending
  const nextStep = current
    ? expressionNext
      ? {
          eyebrow: 'Today',
          title: `Complete the ${current.title} Expression Challenge`,
          detail: 'You hit 14 days. Share what shifted, in person at a Circle or solo online, to finish this Journey.',
          href: `/journeys/${current.slug}`,
        }
      : current.state === 'current'
      ? {
          eyebrow: 'Today',
          title: `Log a ${current.title} practice`,
          detail: `${current.daysLogged} of ${current.daysNeeded} days toward finishing the ${current.pillar} Journey.`,
          href: `/journeys/${current.slug}`,
        }
      : {
          eyebrow: 'Up next',
          title: `${current.title} opens soon`,
          detail: `The ${current.pillar} Journey is next in this Quest. Keep your daily practice going until it opens.`,
          href: `/journeys/${current.slug}`,
        }
    : {
        eyebrow: 'Today',
        title: 'Log a practice',
        detail: 'One logged practice keeps your streak alive and moves your season forward.',
        href: '/practices',
      }

  return (
    <div className="space-y-4">
      {map.journeys.length > 0 ? (
        <SeasonMap
          seasonName={season?.name ?? null}
          weeksLeft={weeksLeft(season)}
          rank={rank}
          journeysFinished={finishedCount}
          journeys={map.journeys}
        />
      ) : (
        // No active Quest Journeys yet — keep the season frame, drop the arcs.
        <EmptyState
          icon={Compass}
          title={season ? `The Quest is open: ${season.name}` : 'The Quest opens soon'}
          description="This Quest's three Journeys (Mind, Body, Spirit) appear here once the season's curriculum is live, each capped by its Expression Challenge. Your daily practice still counts."
        />
      )}

      {/* One next step — the single time-aware nudge. */}
      <Link
        href={nextStep.href}
        className="flex items-start gap-4 rounded-2xl border border-primary-bg bg-primary-bg/40 p-5 transition-colors hover:bg-primary-bg/60 dark:bg-primary-bg/15 dark:hover:bg-primary-bg/25 motion-reduce:transition-none"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
          {expressionNext ? <Sparkles className="h-5 w-5" /> : <Compass className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
            {nextStep.eyebrow}
          </p>
          <p className="text-base font-bold leading-tight text-text">{nextStep.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{nextStep.detail}</p>
        </div>
        <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-subtle sm:block" />
      </Link>

      {/* One dominant primary action. This is a practice app — logging is the move,
          and on a phone the CTA sits in thumb reach at the bottom of the hero. */}
      <Link
        href="/practices"
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-base font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-hover motion-reduce:transition-none"
      >
        <Flame className="h-5 w-5" aria-hidden />
        {hasPracticeToLog ? 'Log a practice' : 'See your practices'}
      </Link>
    </div>
  )
}

function HeroSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 rounded-3xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-12 rounded-2xl" />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CrewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name, handle, community_role, avatar_url, current_season_rank, current_season_zaps, lifetime_gems, current_streak, is_crew_lead')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const isCrew = await isPaidViewer()

  // Derive rank from Journey completions (completion-based model).
  const finishedCount = await journeysFinishedThisSeason(profile.id)
  const currentSeasonRank: SeasonRank = rankForCompletion(finishedCount)

  // Active season — the frame the whole hub hangs on.
  const season = await getCurrentSeason()

  // Whether there's an unlogged practice today (drives the primary CTA's verb).
  const practicesToLog = await getPracticesToLogToday(profile.id)
  const hasPracticeToLog = practicesToLog.length > 0

  // Available GLOBAL catalogue tasks (circle_id IS NULL). Circle-scoped tasks
  // render in their own claim-aware section below. Untyped handle: circle_id
  // isn't in database.types yet (repo convention; see lib/crew/circle-tasks.ts).
  const { data: tasksData } = await (admin)
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
            The Quest
            {isCrewLead && (
              <span className="rounded-md bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                Crew Lead
              </span>
            )}
          </span>
        }
        description={
          <>
            Three Journeys this season: Mind, Body, Spirit, each capped by its Expression Challenge. Finish each to climb from Ghost to Master.
            {circleName && (
              <> You&apos;re in <span className="font-medium text-text">{circleName}</span>.</>
            )}
          </>
        }
      >
        {/* ── The hero: Season Map + one next step + one primary action. The
            standing renders ONCE here, behind Suspense so the per-Journey
            completion read never blocks the shell (PAGE-FRAMEWORK §5). ── */}
        <Suspense fallback={<HeroSkeleton />}>
          <QuestHero
            profileId={profile.id}
            season={season}
            finishedCount={finishedCount}
            rank={currentSeasonRank}
            hasPracticeToLog={hasPracticeToLog}
          />
        </Suspense>

        {/* ── Secondary: everything below the hero is demoted, scannable support. ── */}
        <div className="flex flex-col items-start gap-6 lg:flex-row">

          {/* Left: tasks */}
          <div className="min-w-0 flex-1 space-y-6">

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
                        className={`flex items-start gap-3 rounded-2xl px-4 py-3 transition-colors ${
                          isDone ? 'bg-success-bg/40' : 'bg-surface-elevated/60'
                        }`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isDone ? 'bg-success-bg' : 'bg-surface-elevated'
                        }`}>
                          {isDone ? (
                            <CheckCircle className="h-4 w-4 text-success" />
                          ) : (
                            <Star className="h-4 w-4 text-subtle" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm font-medium ${isDone ? 'text-success' : 'text-text'}`}>
                              {task.name}
                            </span>
                            <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium text-muted">
                              {TASK_TYPE_LABEL[task.task_type] ?? task.task_type}
                            </span>
                            {task.is_repeatable && (
                              <span className="rounded-md bg-signal-bg px-1.5 py-0.5 text-xs font-medium text-signal-strong">
                                Repeatable
                              </span>
                            )}
                            {task.requires_verification && (
                              <span className="rounded-md bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning dark:text-primary">
                                Needs review
                              </span>
                            )}
                          </div>

                          {isDone && lastCompletion?.completed_at && (
                            <p className="mt-0.5 text-xs text-success">
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

                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            <Zap className={`h-3.5 w-3.5 ${isDone ? 'text-success' : 'text-primary'}`} />
                            <span className={`text-sm font-semibold ${isDone ? 'text-success' : 'text-muted'}`}>
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
          <div className="shrink-0 space-y-6 lg:w-72">

            {/* Quick links */}
            <section>
              <SectionHeader title="Explore" />
              <div className="grid grid-cols-2 gap-2">
                <QuickLink href="/crew/quests" Icon={MapIcon} label="Journeys" sub="This season's three" color="bg-broadcast-bg text-broadcast-strong" />
                <QuickLink href="/crew/achievements" Icon={Award} label="Achievements" sub="Earn badges" color="bg-signal-bg text-signal-strong" />
                <QuickLink href="/crew/streaks" Icon={Flame} label="Streaks" sub="Stay consistent" color="bg-warning-bg text-warning dark:text-primary" />
                <QuickLink href="/crew/challenges" Icon={Target} label="Challenges" sub="Season goals" color="bg-primary-bg text-primary-strong" />
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
                        className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 ${
                          isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : ''
                        }`}
                      >
                        <span className={`w-5 shrink-0 text-sm font-bold ${rankColor}`}>{i + 1}</span>

                        {member.avatarUrl ? (
                          <Image src={member.avatarUrl} alt={member.displayName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
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
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-semibold leading-none text-text">{label}</div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </Link>
  )
}
