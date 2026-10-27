import Link from 'next/link'
import { readSpaceCompletionAnalytics } from '@/lib/spaces/completion-analytics'
import { EMPTY, Kpi, n } from '../shared'

/** The owning manage console gates this private, aggregate-only reader before rendering. */
export async function FqJourneyCompletionBand({ spaceId, slug, statsPromise }: { spaceId: string; slug: string; statsPromise?: ReturnType<typeof readSpaceCompletionAnalytics> }) {
  const stats = await (statsPromise ?? readSpaceCompletionAnalytics(spaceId))
  const noStarts = stats?.enrolled === 0
  return (
    <section aria-label="Journey participation">
      <div className="sec-h">
        <h2 className="h3">Your Journeys</h2>
        <Link className="t2" href={`/spaces/${slug}/settings/offerings`}>Offerings</Link>
      </div>
      <p className="t2">{stats ? 'All time. Each person is counted once across this Space’s Journeys.' : 'Journey data is unavailable or incomplete.'}</p>
      <div data-visual-mask="space-console-journey-stats" className="g4 adp-kpi-row">
        <Kpi label="Enrolled" value={stats ? n(stats.enrolled) : EMPTY} note={stats ? `${stats.paidEnrolled > 0 ? `${n(stats.paidEnrolled)} paid · ` : ''}${n(stats.journeyCount)} ${stats.journeyCount === 1 ? 'Journey' : 'Journeys'}` : undefined} />
        <Kpi label="Finished" value={stats ? n(stats.completed) : EMPTY} />
        <Kpi label="Still going" value={stats ? n(stats.inProgress) : EMPTY} />
        <Kpi label="Finish rate" value={stats?.completionPct == null ? EMPTY : `${stats.completionPct}%`} note={noStarts ? 'No one has started yet' : undefined} />
      </div>
    </section>
  )
}
