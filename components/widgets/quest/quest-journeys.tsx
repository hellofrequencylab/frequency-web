import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCrewContext } from '@/lib/quest/crew-context'
import { getMemberJourneyProgress, type MemberJourneyProgress } from '@/lib/journeys/progress'
import { evaluateJourneyCompletion } from '@/lib/quest/completion'
import { JourneyProgressCard } from '@/components/quest/journey-progress-card'
import { SectionHeader } from '@/components/ui/section-header'

// My Quest layout module (ADR-270/294): the member's adopted + member-built Journeys. The
// official season arc lives in the Season Map; this lists everything else the member is running,
// each active one with its honest 14-day arc + Expression state. Self-fetching RSC keyed to the
// signed-in member; renders nothing when there are none, so it never adds clutter.
export async function QuestJourneys() {
  const ctx = await getCrewContext()
  if (!ctx) return null
  const { profileId } = ctx
  const season = ctx.season?.season_number ?? null

  const journeys = await getMemberJourneyProgress(profileId, { activeOnly: false })
  if (journeys.length === 0) return null
  const active = journeys.filter((j) => !j.complete)
  const finished = journeys.filter((j) => j.complete)

  return (
    <section>
      <SectionHeader title="Your Journeys" count={journeys.length} href="/journeys" />
      <div className="space-y-4">
        {active.length > 0 && (
          <Suspense fallback={<ActiveJourneysSkeleton count={active.length} />}>
            <ActiveJourneys profileId={profileId} active={active} season={season} />
          </Suspense>
        )}
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
    </section>
  )
}

// The active Journeys, enriched with the real quest signals (14 distinct days, window dates,
// Expression Challenge state). Each evaluation runs in parallel; this is the slow part, so it
// sits behind a Suspense boundary above.
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

// Dimension-matched skeleton for the streaming active-Journey list (no layout shift).
function ActiveJourneysSkeleton({ count }: { count: number }) {
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
