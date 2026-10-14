import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'
import { upNext, playHref, type OngoingCycle } from '@/components/journey/v2/learn/course-home'
import { unlockLine, type PhaseLockState } from '@/lib/journeys/schedule'
import type { JourneyTree, Lesson, Phase } from '@/lib/journeys/tree'
import { HOME_TZ } from '@/lib/time/zone'

// THE COURSE HOME under Frequency (design_handoff/frequency/templates/members/Journey.html). The
// reference IS the enrolled member's view ("Week 2 of 4 · Lesson 6 next", Continue lesson, the week's
// lessons ticked off), and an enrolled member is redirected from the sales page to
// /journeys/<slug>/learn, so this is where the reference lands. The route keeps its one loader
// (lib/journeys/learn-route.ts: the door, the drip anchor, the Run reads) and hands this body the
// tree, the locks and the controls it already built:
//
//   head          The Quest · Journey / the title / Week N of M · Lesson K next · people on it
//   aura panel    the progress ring, Up next (or caught up / finished), the one primary action
//   columns       each week as a lesson list: done, next (orb + Start), still to come; a locked week
//                 is dimmed with the day it opens; a Run's dated meetup sits in its week  |  who is on
//                 it (friends, the Circle meter), the guide, More Journeys
//
// The player (/play) still owns the lesson itself; every open lesson row links into it.

type Unit = 'week' | 'month'

const TYPE_LABEL: Record<string, string> = {
  video: 'Video',
  reading: 'Reading',
  exercise: 'Exercise',
  reflection: 'Reflection',
  check: 'Knowledge check',
  resource: 'Resource',
  practice: 'Practice',
  lesson: 'Lesson',
}

const unitWord = (u: Unit) => (u === 'month' ? 'Month' : 'Week')

/** "Week 2 · Attention", or "Week 2" when the title only repeats the label. */
function phaseHeading(p: Phase, i: number, u: Unit): string {
  const label = `${unitWord(u)} ${i + 1}`
  const own = p.title?.trim()
  return own && own.toLowerCase() !== label.toLowerCase() ? `${label} · ${own}` : label
}

function lessonSub(l: Lesson, done: boolean, pillar: string | undefined, anchor: boolean): string {
  return [
    l.estMinutes && l.estMinutes > 0 ? `${l.estMinutes} min` : null,
    TYPE_LABEL[l.type] && l.type !== 'lesson' ? TYPE_LABEL[l.type] : null,
    pillar ?? null,
    anchor ? 'Daily anchor' : null,
    l.required ? null : 'Optional',
    done ? 'Done' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: HOME_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type PhaseEvents = Record<
  string,
  { meetup: { slug: string; title: string; startsAt: string } | null; gathering: { slug: string; title: string; startsAt: string } | null }
>

export function JourneyCourseBody({
  slug,
  title,
  summary,
  adoptCount,
  tree,
  locks,
  unit,
  cycle,
  anchorLessonId,
  phaseFocusById,
  pillarByLesson,
  phaseEvents,
  kickoff,
  runLine,
  actions,
  side,
  details,
  leave,
}: {
  slug: string
  title: string
  summary: string | null
  adoptCount: number
  tree: JourneyTree
  locks: PhaseLockState[]
  unit: Unit
  cycle: OngoingCycle
  anchorLessonId: string | null
  phaseFocusById: Record<string, string>
  pillarByLesson: Record<string, string>
  phaseEvents: PhaseEvents
  kickoff: { slug: string; title: string; startsAt: string } | null
  /** "Your Run runs Oct 1 through Nov 12." when the member is in a Run. */
  runLine: string | null
  /** Manage, price, the sales page, the author's publish controls, share. */
  actions: React.ReactNode
  /** The side column, already built (who is on it, the guide, More Journeys). */
  side: React.ReactNode
  /** How it meets and the Run host's schedule: real controls the reference does not draw. */
  details: React.ReactNode
  /** The quiet exit, for an enrolled member. */
  leave: React.ReactNode
}) {
  const lessons = tree.phases.flatMap((p) => p.modules.flatMap((m) => m.lessons))
  const numberOf = new Map(lessons.map((l, i) => [l.id, i + 1]))
  const next = upNext(tree, locks, cycle)
  const nextLock = locks.find((l) => l.locked) ?? null
  const waiting = !next && !tree.complete && !!nextLock
  const openCount = locks.filter((l) => !l.locked).length
  const currentIndex = cycle?.phaseIndex ?? next?.phaseIndex ?? Math.max(0, openCount - 1)
  const nextNumber = next ? numberOf.get(next.lesson.id) : undefined
  // No lessons yet (a fresh Journey, or one whose author has not written the path): say so. Never
  // "Week 1 of 0", "0 of 0 lessons done", or a Start that opens an empty player.
  const empty = lessons.length === 0

  const metaParts: string[] = []
  if (tree.phases.length > 0 && !empty) {
    metaParts.push(`${unitWord(unit)} ${currentIndex + 1} of ${tree.phases.length}${cycle ? ` · Year ${cycle.year}` : ''}`)
  }
  if (next && nextNumber) metaParts.push(`Lesson ${nextNumber} next`)
  metaParts.push(`${adoptCount.toLocaleString()} ${adoptCount === 1 ? 'person' : 'people'} on this Journey`)

  const kicker = empty ? 'Still being written' : tree.complete ? (cycle ? `Every ${unit} is done` : 'Journey finished') : waiting ? 'You are caught up' : 'Up next'
  const heroTitle = empty
    ? 'No lessons yet.'
    : next
    ? `${nextNumber ? `Lesson ${nextNumber} · ` : ''}${next.lesson.title}`
    : tree.complete
      ? cycle
        ? 'This Journey repeats each year.'
        : 'You finished this Journey.'
      : waiting && nextLock
        ? `${unlockLine(nextLock.unlockAt)}.`
        : title
  const heroWhy = empty
    ? 'The path appears here as the guide writes it. You are enrolled, so it shows up for you the day it lands.'
    : next
    ? phaseFocusById[tree.phases[next.phaseIndex]?.id ?? ''] || summary
    : tree.complete
      ? 'Every lesson is done. Revisit any of them below, any time.'
      : waiting
        ? 'Keep your daily practice going until then.'
        : summary
  const cta = tree.doneRequired === 0 ? 'Start the first lesson' : tree.complete || waiting ? 'Open the player' : 'Continue lesson'
  const ctaSub = next
    ? [
        next.lesson.estMinutes ? `${next.lesson.estMinutes} min` : null,
        TYPE_LABEL[next.lesson.type] ? TYPE_LABEL[next.lesson.type].toLowerCase() : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">The Quest · Journey</span>
          <h1 className="h1">
            <SerifTail text={title} />
          </h1>
          <span className="meta">{metaParts.join(' · ')}</span>
        </div>
        <div className="row wrap">{actions}</div>
      </div>

      <section className="panel mc-hero" aria-label="Your progress">
        <div className="fq-aura" aria-hidden />
        <div
          className="mc-ring"
          style={{ '--p': tree.percent } as React.CSSProperties}
          role="img"
          aria-label={`${tree.percent}% of this Journey done`}
        >
          <span>{tree.percent}%</span>
        </div>
        <div className="stack grow mc-gap-10">
          <span className="k">{kicker}</span>
          <span className="h2">{heroTitle}</span>
          {heroWhy && <span className="why">{heroWhy}</span>}
          {!empty && (
            <div className="row wrap">
              <Link className="btn pa lg" href={playHref(slug, next?.lesson.id)}>
                {cta}
              </Link>
              {ctaSub && <span className="t2">{ctaSub}</span>}
            </div>
          )}
          {tree.totalRequired > 0 && (
            <span className="t2">
              {tree.doneRequired} of {tree.totalRequired} lessons done
              {nextLock?.unlockAt && !waiting ? ` · Next ${unit} ${unlockLine(nextLock.unlockAt).toLowerCase()}` : ''}
            </span>
          )}
        </div>
      </section>

      <div className="ap-cols sec">
        <div id="the-path">
          {(kickoff || runLine) && (
            <div className="list mc-bottom-24">
              {kickoff && (
                <Link href={`/events/${kickoff.slug}`}>
                  <span className="ic">
                    <FqIcon name="event" />
                  </span>
                  <span className="grow">
                    <span className="t1 mc-block">Kickoff meetup</span>
                    <span className="t2">{when(kickoff.startsAt)}</span>
                  </span>
                </Link>
              )}
              {runLine && (
                <div>
                  <span className="ic">
                    <FqIcon name="clock" />
                  </span>
                  <span className="t2 grow">{runLine}</span>
                </div>
              )}
            </div>
          )}

          {empty && (
            <div className="empty">
              <p className="why">No lessons yet. The path appears here as the author writes it.</p>
            </div>
          )}

          {tree.phases.map((p, i) => {
            const lock = locks[i] ?? { locked: false, unlockAt: null }
            const phaseLessons = p.modules.flatMap((m) => m.lessons)
            const ev = phaseEvents[p.id]
            const meets = [ev?.meetup, ev?.gathering].filter((e): e is { slug: string; title: string; startsAt: string } => !!e)
            return (
              <div key={p.id}>
                <div className={i === 0 ? 'sec-h' : 'sec-h sec'}>
                  <span className="h2">{phaseHeading(p, i, unit)}</span>
                  <span className="meta">
                    {lock.locked
                      ? unlockLine(lock.unlockAt)
                      : phaseLessons.length === 0
                        ? 'No lessons yet'
                        : p.totalRequired === 0
                          ? 'Optional'
                          : `${p.doneRequired} of ${p.totalRequired} done`}
                  </span>
                </div>
                {!lock.locked && phaseFocusById[p.id] && <p className="why mc-bottom-12">{phaseFocusById[p.id]}</p>}
                <div className={lock.locked ? 'list mc-dim' : 'list'}>
                  {phaseLessons.map((l) => {
                    const isNext = next?.lesson.id === l.id
                    const n = numberOf.get(l.id)
                    const label = `Lesson ${n} · ${l.title}`
                    const sub = lessonSub(l, l.done, pillarByLesson[l.id], l.id === anchorLessonId)
                    const inner = (
                      <>
                        <span className={l.done ? 'ic mc-done' : isNext ? 'ic mc-now' : 'ic'}>
                          <FqIcon name={l.done ? 'checkin' : lock.locked ? 'clock' : 'breath'} />
                        </span>
                        <span className="grow">
                          <span className={l.done ? 't1 mc-block mc-faint' : 't1 mc-block'}>{label}</span>
                          {sub && <span className="t2">{sub}</span>}
                        </span>
                        {isNext && <span className="btn sm pa">Start</span>}
                      </>
                    )
                    return lock.locked ? (
                      <div key={l.id} aria-disabled="true">
                        {inner}
                      </div>
                    ) : (
                      <Link key={l.id} href={playHref(slug, l.id)} aria-current={isNext ? 'step' : undefined}>
                        {inner}
                      </Link>
                    )
                  })}
                  {meets.map((e) => (
                    <Link key={e.slug} href={`/events/${e.slug}`}>
                      <span className="ic">
                        <FqIcon name="circle" />
                      </span>
                      <span className="grow">
                        <span className="t1 mc-block">{e.title}</span>
                        <span className="t2">In person · {when(e.startsAt)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}

          {details && <div className="sec mc-stack-dawn">{details}</div>}
          {leave && <div className="sec">{leave}</div>}
        </div>

        <aside className="side">{side}</aside>
      </div>
    </MembersBody>
  )
}
