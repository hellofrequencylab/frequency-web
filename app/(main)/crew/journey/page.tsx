import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Compass, ArrowRight, Users, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StandingTiles } from '@/components/gamification/standing-tiles'
import { getMemberJourneyProgress } from '@/lib/journeys/progress'
import { rankForZaps } from '@/lib/season-ranks'

// "Your Journey" — the member's enrolled Journeys with v2 phase/program completion (ADR-253;
// docs/JOURNEYS.md §4). Replaces the retired season qualifying-weeks checklist: completion now
// derives from finished lessons/phases in a Run (journey_lesson_progress + the block tree), not
// a daily-cadence clock. Logging earns the Zaps/rank/streak shown up top; finishing lessons in
// the player advances the Journey.
export default async function JourneyPage() {
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

  const rank = rankForZaps(seasonZaps)

  // All enrolled Journeys (including finished ones, so a completed Journey still shows its trophy).
  const journeys = await getMemberJourneyProgress(profile.id, { activeOnly: false })

  return (
    <IndexTemplate
      title="Your Journey"
      description="The guided programs you're moving through, solo or with your Circle. Finish each phase's lessons to advance, earn your trophies, and complete the program."
    >
      {/* Your standing — the four counts the practice log drives (the one way a
          member's standing renders, §2). */}
      <div className="mb-8">
        <StandingTiles
          zaps={seasonZaps}
          gems={gems}
          streak={streak}
          rank={rank}
          links={{ zaps: '/crew/leaderboard', rank: '/crew/achievements', streak: '/crew/streaks', gems: '/crew/store' }}
        />
      </div>

      {journeys.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="You haven't started a Journey yet"
          description="Journeys are guided programs your Circle runs together — bite-sized lessons in weekly phases. Enroll in one to start moving through it."
          action={
            <Link
              href="/journeys"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Browse Journeys <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {journeys.map((j) => (
            <section key={j.planId} className="rounded-2xl border border-border bg-surface p-5">
              <SectionHeader
                title={j.title}
                action={
                  <span className="text-xs font-semibold tabular-nums text-subtle">
                    {j.complete ? 'Complete' : `${j.percent}%`}
                  </span>
                }
              />

              {j.inCohort && (
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-signal-bg px-2 py-1 text-xs font-medium text-signal-strong">
                  <Users className="h-3.5 w-3.5" />
                  Running with your Circle
                </p>
              )}

              {/* Program progress bar. */}
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${j.percent}%` }} />
              </div>

              {j.phasesTotal > 0 && (
                <p className="mb-4 text-xs font-medium text-muted">
                  {j.phasesComplete} of {j.phasesTotal} {j.phasesTotal === 1 ? 'phase' : 'phases'} complete
                </p>
              )}

              {j.complete ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> You finished this Journey
                </p>
              ) : (
                <Link
                  href={j.nextLesson?.href ?? `/journeys/${j.slug}/learn`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  {j.nextLesson ? `Continue: ${j.nextLesson.title}` : 'Open Journey'} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
    </IndexTemplate>
  )
}
