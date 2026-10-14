import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'
import type { JourneyTree, Lesson } from '@/lib/journeys/tree'
import type { JourneyFriend } from '@/lib/journeys/friends-on-journey'
import { OnThisJourneyPanel, MoreJourneysPanel, peopleLine, type MoreJourney } from './journey-side'

// THE JOURNEY BODY under Frequency (design_handoff/frequency/templates/members/Journey.html). The
// page (app/(main)/journeys/[slug]/page.tsx) keeps every read, gate, redirect and control it had; it
// hands this body the data and the controls it already built, so the enrol box, the till, the admin
// doors, reviews and Q&A are the very same components, only placed on the reference's layout:
//
//   head          The Quest · Journey / the title / phases · lessons · enrolled
//   aura panel    the progress ring, Up next, the one primary action
//   columns       each phase as a lesson list (done, next, still to come)  |  enrol box, who is on it,
//                                                                            More Journeys
//
// Every number is read: progress is the member's own completed lessons, the head counts the tree,
// and "on this Journey" is the plan's adopt_count. Nothing is drawn from the reference's sample copy.

interface JourneyBodyPlan {
  slug: string
  title: string
  summary: string | null
  adoptCount: number
}

export type { MoreJourney }

function minutesLine(lesson: Lesson): string | null {
  return lesson.estMinutes && lesson.estMinutes > 0 ? `${lesson.estMinutes} min` : null
}

export function JourneyBody({
  plan,
  tree,
  tracked,
  inside,
  offerLabel,
  credits,
  actions,
  notice,
  enrol,
  details,
  more,
  friends = [],
}: {
  plan: JourneyBodyPlan
  /** The lesson tree, with the viewer's completion when they are on it. */
  tree: JourneyTree
  /** Is completion tracked for this viewer (enrolled or the author)? A visitor sees no ticks. */
  tracked: boolean
  /** Enrolled or the author: the primary action continues the course rather than enrolling. */
  inside: boolean
  /** The price on a sellable Journey ("$40"), else null. */
  offerLabel: string | null
  /** Author and co-host credits, already linked. */
  credits: React.ReactNode
  /** Manage, price and share: the controls the DAWN header carried. */
  actions: React.ReactNode
  /** The author's preview notice, when previewing. */
  notice: React.ReactNode
  /** THE one enrol control (ADR-1401) and any sponsor rewards beneath it. */
  enrol: React.ReactNode
  /** Outcomes, instructor, reviews, FAQ, Q&A and the guarantee: the sales detail, unchanged. */
  details: React.ReactNode
  more: MoreJourney[]
  /** The viewer's friends on this Journey (faces in the side panel). */
  friends?: JourneyFriend[]
}) {
  const lessons = tree.phases.flatMap((p) => p.modules.flatMap((m) => m.lessons))
  const numberOf = new Map(lessons.map((l, i) => [l.id, i + 1]))
  const next = tracked ? lessons.find((l) => l.id === tree.currentLessonId) ?? null : lessons[0] ?? null
  const percent = tracked ? tree.percent : 0
  const learnHref = `/journeys/${plan.slug}/learn`
  const nextNumber = next ? numberOf.get(next.id) : undefined

  // A Journey with no lessons yet says so: never "0 phases · 0 lessons", never a Start that opens
  // an empty player.
  const empty = lessons.length === 0
  const metaParts = empty
    ? ['No lessons yet']
    : [
        `${tree.phases.length} ${tree.phases.length === 1 ? 'phase' : 'phases'}`,
        `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'}`,
      ]
  if (tracked && next && nextNumber) metaParts.push(`Lesson ${nextNumber} next`)
  metaParts.push(peopleLine(plan.adoptCount))

  const primary = empty ? null : inside ? (
    <Link className="btn pa lg" href={learnHref}>
      <FqIcon name="lesson" />
      {tracked && tree.doneRequired > 0 ? 'Continue lesson' : 'Open the course'}
    </Link>
  ) : (
    <a className="btn pa lg" href="#enrol">
      {offerLabel ? `Get access · ${offerLabel}` : 'Start this Journey'}
    </a>
  )

  return (
    <MembersBody>
      {notice}
      <div className="head">
        <div>
          <span className="k">The Quest · Journey</span>
          <h1 className="h1">
            <SerifTail text={plan.title} />
          </h1>
          <span className="meta">{metaParts.join(' · ')}</span>
        </div>
        <div className="row wrap">{actions}</div>
      </div>

      <section className="panel mc-hero">
        <div className="fq-aura" aria-hidden />
        <div
          className="mc-ring"
          style={{ '--p': percent } as React.CSSProperties}
          role="img"
          aria-label={`${percent}% complete`}
        >
          <span>{percent}%</span>
        </div>
        <div className="stack grow mc-gap-10">
          <span className="k">{empty ? 'Still being written' : tree.complete && tracked ? 'Every lesson done' : 'Up next'}</span>
          <span className="h2">
            {next ? `${nextNumber ? `Lesson ${nextNumber} · ` : ''}${next.title}` : plan.title}
          </span>
          {plan.summary ? (
            <span className="why">{plan.summary}</span>
          ) : empty ? (
            <span className="why">The first lessons land here as the guide writes them.</span>
          ) : null}
          <div className="row wrap">
            {primary}
            {next && minutesLine(next) && <span className="t2">{minutesLine(next)}</span>}
          </div>
        </div>
      </section>

      <div className="ap-cols sec">
        <div>
          {tree.phases.length === 0 && (
            <div className="empty">
              <p className="why">No lessons yet. The path appears here as the author writes it.</p>
            </div>
          )}
          {tree.phases.map((phase, i) => {
            const phaseLessons = phase.modules.flatMap((m) => m.lessons)
            return (
              <div key={phase.id} id={i === 0 ? 'the-path' : undefined}>
                <div className={i === 0 ? 'sec-h' : 'sec-h sec'}>
                  <span className="h2">{phase.title?.trim() || `Phase ${i + 1}`}</span>
                  <span className="meta">
                    {phaseLessons.length === 0
                      ? 'No lessons yet'
                      : tracked && phase.totalRequired > 0
                      ? `${phase.doneRequired} of ${phase.totalRequired} done`
                      : `${phaseLessons.length} ${phaseLessons.length === 1 ? 'lesson' : 'lessons'}`}
                  </span>
                </div>
                <div className="list">
                  {phaseLessons.map((lesson) => {
                    const done = tracked && lesson.done
                    const isNext = !!next && lesson.id === next.id && tracked
                    const n = numberOf.get(lesson.id)
                    const label = lesson.title === 'Lesson' ? `Lesson ${n}` : `Lesson ${n} · ${lesson.title}`
                    const sub = [minutesLine(lesson), done ? 'Done' : null, lesson.required ? null : 'Optional']
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <div key={lesson.id}>
                        <span className={done ? 'ic mc-done' : isNext ? 'ic mc-now' : 'ic'}>
                          <FqIcon name={done ? 'checkin' : 'breath'} />
                        </span>
                        <span className="grow">
                          <span className={done ? 't1 mc-block mc-faint' : 't1 mc-block'}>{label}</span>
                          {sub && <span className="t2">{sub}</span>}
                        </span>
                        {isNext && inside && (
                          <Link className="btn sm pa" href={learnHref}>
                            <FqIcon name="breath" />
                            Start
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {details && <div className="sec mc-stack-dawn">{details}</div>}
        </div>

        <aside className="side">
          <div id="enrol" className="stack">
            {enrol}
          </div>
          <OnThisJourneyPanel friends={friends} adoptCount={plan.adoptCount}>
            {credits}
          </OnThisJourneyPanel>
          <MoreJourneysPanel more={more} />
        </aside>
      </div>
    </MembersBody>
  )
}
