import Link from 'next/link'
import { ArrowRight, Compass, Sparkles } from 'lucide-react'
import { getCrewContext } from '@/lib/quest/crew-context'
import { readSeasonMap } from '@/lib/quest/season-map-data'

// My Quest layout module (ADR-270/294): the single time-aware "next step" — the ONE nudge
// for today. Split out of the season map so it can be reordered or hidden on its own from
// Settings → Layout. Self-fetching RSC keyed to the signed-in member via getCrewContext
// (request-cached, so sharing it with the other Quest modules costs nothing); renders nothing
// when there is no viewer.
export async function QuestToday() {
  const ctx = await getCrewContext()
  if (!ctx) return null
  const { profileId, season } = ctx

  const map = await readSeasonMap(profileId, season)
  const current = map.current

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
  )
}
