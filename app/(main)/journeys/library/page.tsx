import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Compass, Play, Users } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberJourneyProgress, type MemberJourneyProgress } from '@/lib/journeys/progress'
import { IndexTemplate } from '@/components/templates/index-template'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { ProgressRing } from '@/components/journey/nav/progress-ring'
import { JourneyDock } from '@/components/journey/nav/journey-dock'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { splitTitle } from '@/lib/journeys/lesson-markdown'
import '@/app/themes/active/members-c'

export const metadata: Metadata = { title: 'Your Library', robots: { index: false } }
export const dynamic = 'force-dynamic'

// THE LIBRARY (/journeys/library) — every Journey you are on, the fourth view of the Journey dock.
// Distinct from /journeys (the community catalog you browse) and /journeys/mine (the ones you
// BUILT). Continue first, the way every course product opens "my courses": the most recent Journey
// you have not finished, with its next lesson one tap away. Then filters and the rest, each card
// with its own ring and next step. Nothing resets; a finished Journey stays here to revisit.

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress' },
  { key: 'new', label: 'Not started' },
  { key: 'done', label: 'Finished' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']

// An ongoing Journey repeats each year, so it is never "Finished": it stays In progress.
const stateOf = (j: MemberJourneyProgress): Exclude<FilterKey, 'all'> =>
  j.complete && !j.ongoing ? 'done' : j.percent > 0 ? 'active' : 'new'

const unitWord = (j: MemberJourneyProgress) => (j.unit === 'month' ? 'Month' : 'Week')

/** "Week 2 of 6": the phase the member is in, in the Journey's own cadence word. */
const placeLine = (j: MemberJourneyProgress) =>
  j.phasesTotal > 0 ? `${unitWord(j)} ${Math.min(j.phasesComplete + 1, j.phasesTotal)} of ${j.phasesTotal}` : null

/** "3 lessons left", or null when nothing is left to count. */
const leftLine = (j: MemberJourneyProgress) => (j.lessonsLeft > 0 ? `${j.lessonsLeft} ${j.lessonsLeft === 1 ? 'step' : 'steps'} left` : null)

/** The Journey phase by phase: one segment per week, filled as far as that week is done, the week
 *  the member is in standing taller. The same bar the Focus player and the course home draw. */
function PhaseSegments({ j }: { j: MemberJourneyProgress }) {
  if (j.phasePercents.length === 0) return null
  const at = j.phasePercents.findIndex((p) => p < 100)
  return (
    <span className="mc-segs" role="img" aria-label={`${j.percent}% of ${j.title} done`}>
      {j.phasePercents.map((p, i) => (
        <span key={i} className={`mc-seg${i === at ? ' on' : ''}`}>
          <i style={{ width: `${p}%` }} />
        </span>
      ))}
    </span>
  )
}

/** The next step, with its kind ("Lesson") set apart from its name. */
function NextStep({ title }: { title: string }) {
  const { kind, name } = splitTitle(title)
  return (
    <>
      Up next{kind ? ` · ${kind}` : ''}: <span className="font-medium text-text">{name}</span>
    </>
  )
}

function JourneyMark({ j }: { j: MemberJourneyProgress }) {
  const Icon = JOURNEY_ICON_MAP[j.emoji ?? ''] ?? DefaultJourneyIcon
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card"
      style={{ backgroundColor: accentTint(j.accent, 16), color: accentColor(j.accent) }}
    >
      <Icon className="h-7 w-7" />
    </span>
  )
}

export default async function JourneyLibraryPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/journeys/library')

  const { filter: raw } = await searchParams
  const filter: FilterKey = FILTERS.find((f) => f.key === raw)?.key ?? 'all'

  // Newest enrolment first (getMemberJourneyProgress orders by started_at), finished ones included.
  const all = await getMemberJourneyProgress(profileId, { activeOnly: false })
  const resume = all.find((j) => stateOf(j) !== 'done') ?? null
  const shown = filter === 'all' ? all : all.filter((j) => stateOf(j) === filter)
  const countFor = (k: FilterKey) => (k === 'all' ? all.length : all.filter((j) => stateOf(j) === k).length)
  const hero = await resolveIndexHero('/journeys/library')
  const docked = resume ?? all[0] ?? null

  return (
    <IndexTemplate
      {...hero}
      title="Your Library"
      description="Every Journey you are on, with your place kept in each one."
      action={
        <Link href="/journeys" className={buttonClasses('secondary', 'md')}>
          <Compass className="h-4 w-4" aria-hidden /> Find a Journey
        </Link>
      }
    >
      <div className="space-y-6">
        {all.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="You are not on a Journey yet"
            description="Pick one from the library and start it solo or with your Circle. It shows up here with your progress."
            action={
              <Link href="/journeys" className={buttonClasses('primary', 'md')}>
                Browse Journeys
              </Link>
            }
          />
        ) : (
          <>
            {resume && (
              <section aria-label="Continue" className="overflow-hidden rounded-card border border-primary/30 bg-surface lift-1 sm:flex">
                <div className="relative aspect-[16/7] w-full shrink-0 bg-surface-elevated sm:aspect-auto sm:w-72">
                  {resume.coverImage ? (
                    <Image src={resume.coverImage} alt="" fill sizes="(min-width: 640px) 18rem, 100vw" className="object-cover" style={{ objectPosition: resume.coverFocus ?? undefined }} />
                  ) : (
                    <span className="flex h-full min-h-32 items-center justify-center">
                      <JourneyMark j={resume} />
                    </span>
                  )}
                </div>
                <div className="flex flex-1 items-center gap-5 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow text-primary-strong">{[resume.percent > 0 ? 'Continue' : 'Start here', placeLine(resume)].filter(Boolean).join(' · ')}</p>
                    <h2 className="mt-1 text-card-title font-bold text-text">{resume.title}</h2>
                    <p className="mt-1 text-body-sm text-muted">
                      {resume.nextLesson ? <NextStep title={resume.nextLesson.title} /> : `Your next ${resume.unit} opens soon.`}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-meta text-muted">
                      <PhaseSegments j={resume} />
                      {leftLine(resume) && <span className="shrink-0 tabular-nums">{leftLine(resume)}</span>}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={resume.nextLesson?.href ?? `/journeys/${resume.slug}/play`} className={buttonClasses('primary', 'md')}>
                        <Play className="h-4 w-4" aria-hidden /> {resume.percent > 0 ? 'Continue' : 'Start'}
                      </Link>
                      <Link href={`/journeys/${resume.slug}/learn`} className={buttonClasses('secondary', 'md')}>
                        Course home
                      </Link>
                    </div>
                  </div>
                  <ProgressRing value={resume.percent} size={88} stroke={8} label={`${resume.percent}% done`} className="max-sm:hidden">
                    <span className="text-body font-bold tabular-nums text-text">{resume.percent}%</span>
                  </ProgressRing>
                </div>
              </section>
            )}

            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const on = filter === f.key
                return (
                  <Link
                    key={f.key}
                    href={f.key === 'all' ? '/journeys/library' : `/journeys/library?filter=${f.key}`}
                    aria-current={on ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-body-sm font-medium transition-colors ${
                      on ? 'border-primary/50 bg-primary-bg text-primary-strong' : 'border-border bg-surface text-muted hover:text-text'
                    }`}
                  >
                    {f.label} <span className="tabular-nums text-meta text-muted">{countFor(f.key)}</span>
                  </Link>
                )
              })}
            </div>

            {shown.length === 0 ? (
              <EmptyState icon={Compass} title="Nothing here yet" description="Switch the filter above to see your other Journeys." />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {shown.map((j) => {
                  const state = stateOf(j)
                  return (
                    <EntityCard
                      key={j.planId}
                      href={`/journeys/${j.slug}/learn`}
                      coverAspect="short"
                      cover={
                        j.coverImage ? (
                          <Image src={j.coverImage} alt="" fill sizes="(min-width: 640px) 28rem, 100vw" className="object-cover" style={{ objectPosition: j.coverFocus ?? undefined }} />
                        ) : (
                          <span className="flex h-full items-center justify-center">
                            <JourneyMark j={j} />
                          </span>
                        )
                      }
                      anchor={
                        <ProgressRing value={j.percent} size={44} stroke={4} label={`${j.percent}% done`}>
                          <span className="text-3xs font-bold tabular-nums text-text">{j.percent}%</span>
                        </ProgressRing>
                      }
                      title={j.title}
                      context={
                        state === 'done'
                          ? 'Finished'
                          : [placeLine(j), leftLine(j), j.inCohort ? 'with your Circle' : null].filter(Boolean).join(' · ')
                      }
                      description={
                        j.nextLesson
                          ? <NextStep title={j.nextLesson.title} />
                          : state === 'done'
                            ? 'Every lesson is done. Revisit any of them.'
                            : j.ongoing && j.complete
                              ? `Every ${j.unit} is done. It repeats each year.`
                              : undefined
                      }
                      meta={
                        <span className="flex w-full items-center gap-2">
                          <PhaseSegments j={j} />
                          {j.inCohort && <Users className="h-3.5 w-3.5 shrink-0" aria-label="With your Circle" />}
                        </span>
                      }
                      footer={
                        state === 'done' ? (
                          <Link href={`/journeys/${j.slug}/play`} className={`${buttonClasses('secondary', 'sm')} w-full justify-center`}>
                            Revisit
                          </Link>
                        ) : (
                          <Link
                            href={j.nextLesson?.href ?? `/journeys/${j.slug}/play`}
                            className={`${buttonClasses('primarySoft', 'sm')} w-full justify-center`}
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden /> {state === 'new' ? 'Start' : 'Continue'}
                          </Link>
                        )
                      }
                    />
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <JourneyDock slug={docked?.slug ?? null} active="library" percent={docked?.percent ?? 0} />
    </IndexTemplate>
  )
}
