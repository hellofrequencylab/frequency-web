import { IndexHeader } from '@/components/templates/index-header'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'
import { phStyle } from '@/components/frequency/members/shared/avatar'
import { NewJourneyButton } from '@/components/studio/journey/new-journey-button'
import type { JourneyPlan } from '@/lib/journey-plans'
import type { MemberJourneyProgress } from '@/lib/journeys/progress'
import { peopleLine } from './journey-side'

// THE JOURNEYS INDEX under Frequency. The reference has no index screen (Journey.html is one Journey),
// so this is the members kit's own idiom, built from what /journeys already offers under DAWN:
//
//   head          The Quest / the operator-editable title and line / New journey, Your journeys, the CTA
//   keep going    the Journeys this member is on, each with its real progress and next lesson
//   two ways in   build your own (the Studio), or this season's Quest (My Quest)       [journeys-start]
//   yours         the Journeys this member built, to manage                            [journeys-mine]
//   library       every public Journey but the member's own                            [journeys-library]
//
// The three bracketed sections are the route's layout modules, so the order and visibility an
// operator set in Settings -> Page -> Layout still apply (visibleModuleOrder).

function planCard(p: JourneyPlan, mine: boolean) {
  const href = mine && p.visibility === 'private' ? `/journeys/${p.slug}/edit` : `/journeys/${p.slug}`
  const status = mine ? (p.visibility === 'public' ? 'In the library' : p.visibility === 'unlisted' ? 'Unlisted' : 'Draft') : null
  return (
    <Link key={p.id} className="card mc-jcard" href={href}>
      <span className="ph mc-jcard-ph" style={phStyle(p.cover_image)} aria-hidden>
        {!p.cover_image && <FqIcon name="lesson" />}
      </span>
      <span className="stack mc-gap-6 mc-jcard-body">
        <span className="t1">{p.title}</span>
        {p.summary && <span className="t2 mc-clamp-2">{p.summary}</span>}
        <span className="t2">{[status, peopleLine(p.adopt_count)].filter(Boolean).join(' · ')}</span>
      </span>
    </Link>
  )
}

export function JourneysIndexBody({
  title,
  description,
  intro,
  cta,
  canBuild,
  order,
  progress,
  mine,
  library,
}: {
  title: string
  description: string | null
  /** The operator's longer intro (page content body), already rendered. */
  intro: React.ReactNode
  cta: { label: string; href: string } | null
  canBuild: boolean
  /** The visible layout modules, in the operator's order. */
  order: string[]
  progress: MemberJourneyProgress[]
  mine: JourneyPlan[] | null
  library: JourneyPlan[]
}) {
  const active = progress.filter((j) => !j.complete || j.ongoing)
  const finished = progress.filter((j) => j.complete && !j.ongoing)

  const sections: Record<string, React.ReactNode> = {
    'journeys-start': (
      <div key="start" className="g2 sec">
        <div className="soft stack mc-start">
          <span className="k">Build</span>
          <span className="h3">Start a journey</span>
          <span className="t2">
            From a single daily practice to a full course. Give it a face, add your practices, and share how you show up.
          </span>
          <NewJourneyButton canCreate={canBuild} className="btn pa" />
        </div>
        <Link className="panel stack mc-start" href="/crew">
          <span className="k">The Quest</span>
          <span className="h3">This season&apos;s Quest</span>
          <span className="t2">The season&apos;s official Journeys: guided tracks of practices, free to start, with rewards as you go.</span>
          <span className="btn sm">Open My Quest</span>
        </Link>
      </div>
    ),
    'journeys-mine': mine ? (
      <div key="mine" className="sec">
        <div className="sec-h">
          <span className="h2">Yours</span>
          <Link className="meta" href="/journeys/mine">
            {mine.length > 0 ? `Manage all ${mine.length}` : 'Manage'}
          </Link>
        </div>
        {mine.length === 0 ? (
          <div className="empty">
            <p className="why">No journeys yet. New journey opens the builder.</p>
          </div>
        ) : (
          <div className="g3">{mine.slice(0, 6).map((p) => planCard(p, true))}</div>
        )}
      </div>
    ) : null,
    'journeys-library': (
      <div key="library" className="sec">
        <div className="sec-h">
          <span className="h2">The library</span>
          <span className="meta">
            {library.length} {library.length === 1 ? 'Journey' : 'Journeys'} from the community
          </span>
        </div>
        {library.length === 0 ? (
          <div className="empty">
            <p className="why">The library is just getting started. Build a journey and share it to be the first.</p>
          </div>
        ) : (
          <div className="g3">{library.map((p) => planCard(p, false))}</div>
        )}
      </div>
    ),
  }

  return (
    <MembersBody>
      <IndexHeader title={<SerifTail text={title} />} description={description} adminBar={false} action={<div className="row wrap">
          <NewJourneyButton canCreate={canBuild} className="btn pa" />
          <Link className="btn" href="/journeys/mine">
            Your journeys
          </Link>
          {cta && (
            <a className="btn" href={cta.href}>
              {cta.label}
            </a>
          )}
        </div>} />
      {intro && <div className="body mc-bottom-24">{intro}</div>}

      {active.length > 0 && (
        <section aria-label="Keep going">
          <div className="sec-h">
            <span className="h2">Keep going</span>
            <span className="meta">
              {active.length} {active.length === 1 ? 'Journey' : 'Journeys'} on the go
            </span>
          </div>
          <div className="g2">
            {active.map((j) => (
              <div key={j.planId} className="panel stack">
                <div className="row">
                  <span className="ph mc-thumb" style={phStyle(j.coverImage)} aria-hidden />
                  <span className="grow">
                    <Link className="t1 mc-block" href={`/journeys/${j.slug}/learn`}>
                      {j.title}
                    </Link>
                    <span className="t2">
                      {j.phasesTotal > 0 ? `${j.phasesComplete} of ${j.phasesTotal} phases done` : 'No lessons yet'}
                      {j.inCohort ? ' · with your Circle' : ''}
                    </span>
                  </span>
                  <span className="t1">{j.percent}%</span>
                </div>
                <div className="meter" role="img" aria-label={`${j.percent}% done`}>
                  <i style={{ width: `${j.percent}%` }} />
                </div>
                <div className="row wrap">
                  <Link className="btn sm pa" href={j.nextLesson?.href ?? `/journeys/${j.slug}/learn`}>
                    {j.percent === 0 ? 'Start' : 'Continue'}
                  </Link>
                  {j.nextLesson && <span className="t2 grow">Next: {j.nextLesson.title}</span>}
                </div>
              </div>
            ))}
          </div>
          {finished.length > 0 && (
            <p className="t2 mc-top-12">
              Finished: {finished.map((j, i) => (
                <span key={j.planId}>
                  {i > 0 ? ', ' : ''}
                  <Link href={`/journeys/${j.slug}/learn`}>{j.title}</Link>
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      {order.map((id) => sections[id] ?? null)}
    </MembersBody>
  )
}
