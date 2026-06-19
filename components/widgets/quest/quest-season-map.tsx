import Link from 'next/link'
import { ArrowRight, Compass, Sparkles } from 'lucide-react'
import { getCrewContext } from '@/lib/quest/crew-context'
import { getPracticesToLogToday } from '@/lib/practices'
import { readSeasonMap, readPillarProgress, weeksLeft, seasonStartState } from '@/lib/quest/season-map-data'
import { SeasonMap } from '@/components/quest/season-map'
import { EmptyState } from '@/components/ui/empty-state'
import { HubPrimaryCta } from '@/app/(main)/crew/hub-primary-cta'

// My Quest layout module (ADR-270/294): the hero. The glanceable season standing — the
// four-Pillar Season Map — plus the ONE time-aware next step and the single primary action
// (log a practice). Self-fetching RSC keyed to the signed-in member via getCrewContext;
// renders nothing when there is no viewer.
export async function QuestSeasonMap() {
  const ctx = await getCrewContext()
  if (!ctx) return null
  const { profileId, season, finishedCount, rank } = ctx

  const [map, pillars, practicesToLog] = await Promise.all([
    readSeasonMap(profileId, season),
    readPillarProgress(profileId, season),
    getPracticesToLogToday(profileId),
  ])
  const hasPracticeToLog = practicesToLog.length > 0
  const current = map.current

  // A live season can be dated to start later; until then the Pillar gauges count nothing
  // (days are counted inside the season window), so the map names the start instead of
  // reading as broken. Resolved in a plain helper so the view stays pure.
  const { notStarted: seasonNotStarted, startLabel: seasonStartLabel } = seasonStartState(season)

  // The one time-aware next step. Default: keep going on the current Journey (N of 14 distinct
  // days). If the only thing left to finish it is the Expression Challenge, point there.
  // Endowed-progress framing — credit days already done.
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
            detail: `${current.daysLogged} of ${current.daysNeeded} days toward finishing ${current.title}.`,
            href: `/journeys/${current.slug}`,
          }
        : {
            eyebrow: 'Up next',
            title: `${current.title} opens soon`,
            detail: `${current.title} is next in this Quest. Keep your daily practice going until it opens.`,
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
          pillars={pillars}
          notStarted={seasonNotStarted}
          startLabel={seasonStartLabel}
        />
      ) : (
        // No active Quest Journeys yet — keep the season frame, drop the arcs.
        <EmptyState
          icon={Compass}
          title={season ? `The Quest is open: ${season.name}` : 'The Quest opens soon'}
          description="This Quest's three Journeys appear here once the season's curriculum is live. Each covers all four Pillars: Mind, Body, Spirit, and Expression. Your daily practice still counts."
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
          <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">{nextStep.eyebrow}</p>
          <p className="text-base font-bold leading-tight text-text">{nextStep.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{nextStep.detail}</p>
        </div>
        <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-subtle sm:block" />
      </Link>

      {/* One dominant primary action. This is a practice app, so logging is the move. On a phone
          the CTA sits in the thumb zone, pinned just above the mobile bottom nav (HubPrimaryCta);
          on md and up it stays in-flow at the end of the hero. */}
      <HubPrimaryCta href="/practices" label={hasPracticeToLog ? 'Log a practice' : 'See your practices'} />
    </div>
  )
}
