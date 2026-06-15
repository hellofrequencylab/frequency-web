import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Compass, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StandingTiles } from '@/components/gamification/standing-tiles'
import { JourneyRank } from '@/components/quest/journey-rank'
import { HeroMoment } from '@/components/quest/hero-moment'
import { JourneyProgressCard } from '@/components/quest/journey-progress-card'
import { getMemberJourneyProgress, type MemberJourneyProgress } from '@/lib/journeys/progress'
import { rankForCompletion, journeysFinishedThisSeason, type SeasonRank } from '@/lib/season-ranks'
import { getCurrentSeason } from '@/lib/seasons'
import { evaluateJourneyCompletion } from '@/lib/quest/completion'
import { isoDaysAgo } from '@/lib/utils'

// "Your Journey" — the member's Journeys view, and the center of gravity for The Quest:
// this is where season RANK actually advances, so the rank ladder lives at the top
// (Ghost → Initiate → Adept → Master, the next rung always named). Season rank = Journeys
// finished this season; a Journey is finished by logging its Practices on 14 distinct days
// in its ~4-week window AND completing its Expression Challenge. Each active Journey shows
// that honest arc and brings its Expression Challenge capstone in-flow.

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ finished?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, current_season_zaps, lifetime_gems, current_streak')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  const seasonZaps = (profile as { current_season_zaps: number }).current_season_zaps ?? 0
  const gems = (profile as { lifetime_gems: number }).lifetime_gems ?? 0
  const streak = (profile as { current_streak: number | null }).current_streak ?? 0

  // Shell-fast reads: rank context + the enrolled list drive the page header and ladder.
  const [finishedCount, season, journeys] = await Promise.all([
    journeysFinishedThisSeason(profile.id),
    getCurrentSeason(),
    getMemberJourneyProgress(profile.id, { activeOnly: false }),
  ])
  const rank = rankForCompletion(finishedCount)
  const params = await searchParams

  const active = journeys.filter((j) => !j.complete)
  const finished = journeys.filter((j) => j.complete)

  return (
    <IndexTemplate
      title="Your Journey"
      description="Where your rank grows. Finish a Journey by practicing on 14 different days and completing its Expression Challenge, then climb Ghost to Master."
    >
      {/* The rank ladder — the stakes, visible while you practice (the audit's core fix). */}
      <div className="mb-6">
        <JourneyRank
          rank={rank}
          journeysFinished={finishedCount}
          seasonName={season?.name}
          rankHref="/crew/achievements"
        />
      </div>

      {/* The four counts the practice log drives — the one way standing renders (§2).
          Rank is shown as the ladder above, so it's dropped here to avoid doubling. */}
      <div className="mb-8">
        <StandingTiles
          zaps={seasonZaps}
          gems={gems}
          streak={streak}
          rank={rank}
          showRank={false}
          links={{ zaps: '/crew/leaderboard', rank: '/crew/achievements', streak: '/crew/streaks', gems: '/crew/store' }}
        />
      </div>

      {/* Hero moment — rationed to a real finish, triggered best-effort by the completion
          path's ?finished=<planId>. Streams in so it never blocks the page. */}
      {params.finished && (
        <Suspense fallback={null}>
          <FinishHero
            profileId={profile.id}
            planId={params.finished}
            rank={rank}
            justAdvanced={finishedCount > 0 && rankForCompletion(finishedCount - 1) !== rank}
            journeys={journeys}
          />
        </Suspense>
      )}

      {journeys.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="You haven't started a Journey yet"
          description="A Journey is a guided ~4-week program you run solo or with your Circle. Practice on 14 different days and finish its Expression Challenge to earn a Trophy and climb a rank."
          action={
            <Link
              href="/journeys"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
            >
              Browse Journeys <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <div>
              <SectionHeader title="In progress" count={active.length} />
              {/* The honest per-Journey arc streams behind its own boundary, so the slower
                  quest-signal reads never block the rank ladder above. */}
              <Suspense fallback={<ActiveSkeleton count={active.length} />}>
                <ActiveJourneys profileId={profile.id} active={active} season={season?.season_number ?? null} />
              </Suspense>
            </div>
          )}

          {finished.length > 0 && (
            <div>
              <SectionHeader title="Finished" count={finished.length} />
              <div className="space-y-4">
                {finished.map((j) => (
                  <JourneyProgressCard
                    key={j.planId}
                    planId={j.planId}
                    slug={j.slug}
                    title={j.title}
                    inCohort={j.inCohort}
                    finished
                    distinctDays={14}
                    daysRequired={14}
                    hasExpression
                    expressionDone
                    windowStartsAt={null}
                    windowEndsAt={null}
                    learnHref={`/journeys/${j.slug}/learn`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </IndexTemplate>
  )
}

// The active Journeys, enriched with the real quest signals (14-distinct-days, window
// dates, Expression Challenge state). Each evaluation runs in parallel; this is the slow
// part, so it sits behind a Suspense boundary in the page.
async function ActiveJourneys({
  profileId,
  active,
  season,
}: {
  profileId: string
  active: MemberJourneyProgress[]
  season: number | null
}) {
  const admin = createAdminClient()
  const planIds = active.map((j) => j.planId)

  // Batch: window dates for every active plan, and which plans have an Expression
  // Challenge this season (so the capstone only offers when one actually exists).
  const [{ data: planRows }, { data: challengeRows }] = await Promise.all([
    admin.from('journey_plans').select('id, window_starts_at, window_ends_at').in('id', planIds),
    season != null
      ? admin.from('season_challenges').select('journey_id').eq('season', season).in('journey_id', planIds)
      : Promise.resolve({ data: [] as { journey_id: string | null }[] }),
  ])

  const windowById = new Map<string, { start: string | null; end: string | null }>()
  for (const r of (planRows ?? []) as { id: string; window_starts_at: string | null; window_ends_at: string | null }[]) {
    windowById.set(r.id, { start: r.window_starts_at, end: r.window_ends_at })
  }
  const hasExpression = new Set(
    ((challengeRows ?? []) as { journey_id: string | null }[])
      .map((r) => r.journey_id)
      .filter((id): id is string => !!id),
  )

  // Per-Journey eligibility (distinct days + expression done + finished), in parallel.
  const evals = await Promise.all(
    active.map((j) =>
      season != null ? evaluateJourneyCompletion(profileId, j.planId, season) : Promise.resolve(null),
    ),
  )

  return (
    <div className="space-y-4">
      {active.map((j, i) => {
        const e = evals[i]
        const win = windowById.get(j.planId)
        return (
          <JourneyProgressCard
            key={j.planId}
            planId={j.planId}
            slug={j.slug}
            title={j.title}
            inCohort={j.inCohort}
            finished={e?.finished ?? false}
            distinctDays={e?.distinctDays ?? 0}
            daysRequired={e?.daysRequired ?? 14}
            hasExpression={hasExpression.has(j.planId)}
            expressionDone={e?.expressionDone ?? false}
            windowStartsAt={win?.start ?? null}
            windowEndsAt={win?.end ?? null}
            learnHref={j.nextLesson?.href ?? `/journeys/${j.slug}/learn`}
          />
        )
      })}
    </div>
  )
}

// The finish hero — best-effort: only render when there's a real, recent completion row
// for the named plan this season, so a bare ?finished= in the URL can't fake the moment.
async function FinishHero({
  profileId,
  planId,
  rank,
  justAdvanced,
  journeys,
}: {
  profileId: string
  planId: string
  rank: SeasonRank
  justAdvanced: boolean
  journeys: MemberJourneyProgress[]
}) {
  const season = await getCurrentSeason()
  if (!season) return null

  // Only celebrate a genuinely recent finish (within the day) — the recency bound goes
  // into the query, so a stale ?finished= link is inert.
  const admin = createAdminClient()
  const { data: completion } = await admin
    .from('journey_completions')
    .select('id')
    .eq('profile_id', profileId)
    .eq('journey_id', planId)
    .eq('season', season.season_number)
    .gte('completed_at', isoDaysAgo(1))
    .maybeSingle()

  if (!completion) return null

  const title = journeys.find((j) => j.planId === planId)?.title ?? 'this Journey'

  return (
    <div className="mb-8">
      <HeroMoment
        journeyTitle={title}
        zaps={75}
        rank={rank}
        rankAdvanced={justAdvanced}
        trophiesHref="/crew/achievements"
      />
    </div>
  )
}

// Dimension-matched skeleton for the streaming active-Journey section (no layout shift).
function ActiveSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: Math.max(1, count) }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-5">
          <div className="mb-3 h-4 w-40 rounded bg-surface-elevated" />
          <div className="h-2 w-full rounded-full bg-surface-elevated" />
          <div className="mt-3 h-9 w-36 rounded-lg bg-surface-elevated" />
        </div>
      ))}
    </div>
  )
}
