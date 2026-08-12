import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Map } from 'lucide-react'
import { loadCircleShell } from '@/lib/circles/store'
import { getCohortProgress } from '@/lib/journeys/runs'
import { CohortMeter } from '@/components/journey/v2/cohort-meter'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonClasses } from '@/components/ui/button'
import { loadCircleActiveRun } from '../tab-facts'

// ── THE JOURNEY TAB ─────────────────────────────────────────────────────────────────────────────
//
// A BODY, not a shell: the cover, the title and the tab strip belong to the route-segment layout
// one directory up, which owns the single page <h1>.
//
// A RUN, NOT A COURSE CATALOGUE. This tab answers one question: how far has this Circle got
// together. A Circle goes through one Journey at a time (ADR-252), so there is one Run here, one
// shared meter, and a way into the Journey itself. The tab does not exist at all until a Run is
// active (lib/circles/tabs.ts), which is why there is no "start one" state on it: starting a Run is
// the host's act and it lives in the admin rail with the rest of the host tools.
//
// MEMBER COPY SAYS "RUN", NEVER "COHORT" (docs/NAMING.md). `getCohortProgress` is the internal
// name of the read; nothing it produces is labelled that way on screen.
//
// THE METER IS COOPERATIVE BY DESIGN and it is the whole reason this is not a leaderboard: one
// shared bar for the Circle, no per-member ranking (JOURNEYS.md §3). The progress read walks every
// enrolled member's tree, so it streams behind its own <Suspense> while the Journey's identity
// paints immediately (PAGE-FRAMEWORK §5.2/§5.3).

export const metadata = { title: 'Journey' }

export default async function CircleJourneyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // The same request-memoized load the shell made: a hit, not a second pair of queries.
  const shell = await loadCircleShell(slug)
  if (!shell) notFound()
  const { circle } = shell

  // Memoized by the shell, which already asked this to decide whether this tab exists.
  const run = await loadCircleActiveRun(circle.id)

  if (!run) {
    // Only reachable by direct link: the strip hides this tab when there is no Run.
    return (
      <EmptyState
        icon={Map}
        title="No journey running"
        description="This circle is not part-way through a journey right now. When the host starts one, the whole circle moves through it together and the progress shows up here."
      />
    )
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="circle-journey-heading" className="space-y-3">
        <div>
          <SectionHeader
            id="circle-journey-heading"
            title={run.plan.emoji ? `${run.plan.emoji} ${run.plan.title}` : run.plan.title}
            action={
              <Link href={`/journeys/${run.plan.slug}`} className={buttonClasses('secondary', 'sm')}>
                Open the journey
              </Link>
            }
          />
          {run.plan.summary && <p className="-mt-2 text-body-sm text-muted">{run.plan.summary}</p>}
        </div>

        {/* The shared meter. It belongs to the group, and it leads. */}
        <Suspense fallback={<Skeleton className="h-28 w-full rounded-xl" />}>
          <RunProgress runId={run.id} planId={run.plan.id} circleName={circle.name} />
        </Suspense>
      </section>
    </div>
  )
}

async function RunProgress({
  runId,
  planId,
  circleName,
}: {
  runId: string
  planId: string
  circleName: string
}) {
  const progress = await getCohortProgress(runId, planId)

  // CohortMeter renders nothing when nobody is enrolled yet, which is a real state on the day a
  // host starts a Run. Say so plainly rather than leaving a gap where a meter should be.
  if (progress.memberCount === 0) {
    return (
      <p className="text-body-sm text-muted">
        Nobody has started yet. Progress shows up here as soon as the first person opens a lesson.
      </p>
    )
  }

  return <CohortMeter progress={progress} circleName={circleName} />
}
