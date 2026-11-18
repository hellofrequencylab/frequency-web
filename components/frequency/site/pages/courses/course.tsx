// /courses/<slug>: the standard page for every Creator Lab course (owner 2026-11-18: "present it as one
// named library", one page per course built from the same template). A course with a hand-built sales page
// (lib/courses/tracks.ts COURSE_SALES_PAGES) uses that instead; every other course renders here.
//
// THE SAME FACTS IN THE SAME PLACE, on every course: who it's for, the next Run's dates (or "self-paced"),
// time per week, what you leave with, the certificate, and who teaches it. The facts panel sits beside the
// syllabus so a visitor can compare two courses at a glance.
//
// THE FREE PIECE. Week 1 (the first phase) is open to read at /courses/<slug>/week-1, with no account and no
// email: research on course lead magnets says the free piece works when it is a real slice of the paid one.
// The email form beside it is optional: it sends Week 1 and the next dates to an inbox, and asks once,
// separately, whether the person wants notes from Frequency (double opt-in, app/(marketing)/subscribe).
//
// Cluster links: every course page links up to the topic hub (COURSE_HUB) and across to the library, and the
// hub links down to the library, so search reads the courses as one body of work on one topic.

import Link from 'next/link'
import type { JourneyFacts } from '@/components/journey/discovery-widgets'
import { formatMinutes } from '@/components/journey/discovery-widgets'
import { ShareButton } from '@/components/discover/share-button'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { JsonLd } from '@/components/json-ld'
import { faqSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'
import { COURSE_HUB, LIBRARY_NAME } from '@/lib/courses/tracks'
import type { RunSession } from '@/lib/courses/course-context'
import { runLabel, sessionDay, sessionTime } from '@/lib/courses/run-format'
import type { JourneyFaqItem } from '@/lib/journeys/faq'
import { ActionPanel, count, DetailBody, DirHero, DirPage, Fact, photo } from '../discover/dir-parts'
import { CourseLeadForm } from './course-lead-form'

export interface CourseView {
  slug: string
  path: string
  title: string
  summary: string | null
  intro: string | null
  image: string | null
  trackLabel: string
  /** Who it's for: the course's own line, else its track's. */
  audience: string
  outcomes: string[]
  faqs: JourneyFaqItem[]
  facts: JourneyFacts
  sessions: RunSession[]
  guides: { name: string; handle: string | null }[]
  /** The hosting Space's name, or null for a Frequency course. */
  hostName: string | null
  certificate: boolean
  /** Offers Certified (a reviewer reads the Community Book) and Attended (every live session). */
  certified: boolean
  /** Null: free. */
  priceLabel: string | null
  /** Where "Start" goes: the sign-in door that returns to the Journey. */
  startHref: string
  /** Week 1 is open to read. */
  hasPreview: boolean
}

/** Time per week: the lessons spread over the phases, plus the live session when there is one. */
function perWeek(v: CourseView): string | null {
  const lessons = v.facts.totalMinutes ?? 0
  const weeks = v.facts.phaseCount
  const live = v.sessions[0]?.endsAt
    ? Math.round((Date.parse(v.sessions[0].endsAt) - Date.parse(v.sessions[0].startsAt)) / 60000)
    : 0
  if (weeks <= 1) return formatMinutes(lessons + live)
  const each = Math.round(lessons / weeks) + live
  return each > 0 ? `About ${formatMinutes(each)} a week` : null
}

function guidesLine(guides: CourseView['guides'], hostName: string | null): string {
  const names = guides.map((g) => g.name)
  const who = names.length === 0 ? null : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return who ? `${who}${hostName ? `, ${hostName}` : ''}` : hostName ?? SITE_NAME
}

export function FrequencyCourse({ v }: { v: CourseView }) {
  const run = runLabel(v.sessions)
  const week = perWeek(v)
  const firstSession = v.sessions[0]
  const live = Boolean(firstSession)
  const primary = live
    ? { href: `/events/${firstSession!.slug}`, label: 'Save your seat' }
    : { href: v.startHref, label: v.priceLabel ? `Get access · ${v.priceLabel}` : 'Start free' }
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[{ label: 'Home', href: '/' }, { label: LIBRARY_NAME, href: '/courses' }, { label: v.title }]}
        image={v.image || photo('gathering-03.jpg')}
        title={v.title}
        lede={v.summary ?? undefined}
        facts={
          <>
            <Fact icon="program">{v.trackLabel}</Fact>
            {v.facts.phaseCount > 0 && <Fact icon="lesson">{count(v.facts.phaseCount, 'part', 'parts')}</Fact>}
            {week && <Fact icon="clock">{week}</Fact>}
            {run ? <Fact icon="event">Live: {run}</Fact> : <Fact icon="event">Self-paced</Fact>}
            {!v.priceLabel && <Fact icon="award">Free</Fact>}
          </>
        }
      >
        <Link className="btn fq-iri-btn" href={primary.href}>
          {primary.label}
        </Link>
        {v.hasPreview && (
          <Link className="btn btn-ghost fq-iri-rim" href={`/courses/${v.slug}/week-1`}>
            Read Week 1 free
          </Link>
        )}
      </DirHero>

      <DetailBody
        main={
          <>
            {v.intro && (
              <section>
                <h2>About this course</h2>
                <p className="dd-prose">{v.intro}</p>
              </section>
            )}

            {v.outcomes.length > 0 && (
              <section>
                <h2>What you leave with</h2>
                <ul className="dd-list">
                  {v.outcomes.map((line, i) => (
                    <li key={`${i}:${line}`}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2>The course, part by part</h2>
              {v.facts.lessonCount === 0 ? (
                <p className="dd-prose">The parts of this course are being written.</p>
              ) : (
                <div className="qa dd-qa">
                  {v.facts.phases.map((p, i) => {
                    const lessons = p.modules.flatMap((m) => m.lessons)
                    const pt = formatMinutes(v.facts.phaseMinutes.get(p.id) ?? null)
                    return (
                      <details key={p.id} open={i === 0}>
                        <summary>
                          <span>
                            {p.title || `Part ${i + 1}`}
                            <small>{[count(lessons.length, 'step', 'steps'), pt].filter(Boolean).join(' · ')}</small>
                          </span>
                        </summary>
                        <ul className="dd-list">
                          {lessons.map((l) => (
                            <li key={l.id}>
                              <span>{l.title}</span>
                              {l.estMinutes ? <small>{l.estMinutes} min</small> : null}
                            </li>
                          ))}
                        </ul>
                        {i === 0 && v.hasPreview && (
                          <p className="dd-fine">
                            <Link href={`/courses/${v.slug}/week-1`}>Read this part free, no account needed.</Link>
                          </p>
                        )}
                      </details>
                    )
                  })}
                </div>
              )}
            </section>

            {live && (
              <section>
                <h2>The next Run</h2>
                <ul className="dd-list">
                  {v.sessions.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/events/${s.slug}`}>{s.title}</Link>
                      <small>
                        {sessionDay(s)} · {sessionTime(s)}
                      </small>
                    </li>
                  ))}
                </ul>
                <p className="dd-fine">
                  Save your seat once and you are in for every session, with reminders before each one. Can’t make
                  one? The replay comes to everyone who signed up.{' '}
                  <a href={`/courses/${v.slug}/calendar.ics`}>Add every session to your calendar.</a>
                </p>
              </section>
            )}

            <section>
              <h2>{v.guides.length > 1 ? 'Your guides' : 'Your guide'}</h2>
              {v.guides.length > 0 ? (
                <ul className="dd-list">
                  {v.guides.map((g) => (
                    <li key={g.handle ?? g.name}>
                      {g.handle ? <Link href={`/people/${g.handle}`}>{g.name}</Link> : <span>{g.name}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dd-prose">Taught by {v.hostName ?? SITE_NAME}.</p>
              )}
            </section>

            {v.faqs.length > 0 && (
              <section>
                <h2>Questions</h2>
                <JsonLd data={faqSchema(v.faqs)} />
                <div className="qa">
                  {v.faqs.map((f) => (
                    <details key={f.q}>
                      <summary>{f.q}</summary>
                      <p>{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2>Part of {LIBRARY_NAME}</h2>
              <p className="dd-prose">
                {LIBRARY_NAME} is Frequency’s free training library for people who gather others. Start with the
                guide, then take the course that fits your season.
              </p>
              <ul className="dd-list">
                <li>
                  <Link href={COURSE_HUB.path}>{COURSE_HUB.label}</Link>
                </li>
                <li>
                  <Link href="/courses">Every course in {LIBRARY_NAME}</Link>
                </li>
              </ul>
            </section>
          </>
        }
        side={
          <>
            <ActionPanel title="At a glance">
              <dl className="dd-facts-list">
                <dt>Who it’s for</dt>
                <dd>{v.audience}</dd>
                <dt>When</dt>
                <dd>{run ? `${run}, ${sessionTime(firstSession!)}` : 'Self-paced. Start any time.'}</dd>
                <dt>Time</dt>
                <dd>{week ?? 'Short lessons, at your own pace'}</dd>
                <dt>You leave with</dt>
                <dd>{v.outcomes[0] ?? 'A practice you can run with your own people'}</dd>
                <dt>Certificate</dt>
                <dd>
                  {v.certified ? (
                    <>
                      Attended for every live session. Certified when a reviewer reads your Community Book.{' '}
                      <Link href={`/courses/${v.slug}/certify`}>Send yours in</Link>
                    </>
                  ) : v.certificate ? (
                    'Yes, a shareable certificate from Frequency'
                  ) : (
                    'Not for this course'
                  )}
                </dd>
                <dt>Taught by</dt>
                <dd>{guidesLine(v.guides, v.hostName)}</dd>
                <dt>Cost</dt>
                <dd>{v.priceLabel ?? 'Free'}</dd>
              </dl>
              <Link className="btn fq-iri-btn" href={primary.href}>
                {primary.label}
              </Link>
              <ShareButton
                path={v.path}
                title={`${v.title} · ${SITE_NAME}`}
                text={v.summary ?? `A course in ${LIBRARY_NAME}, from ${SITE_NAME}.`}
                label="Share"
              />
            </ActionPanel>
            {v.hasPreview && (
              <ActionPanel title="Not ready to sign up?">
                <p>Get Week 1 in your inbox{live ? ', with the dates of the next Run' : ''}. No account needed.</p>
                <CourseLeadForm slug={v.slug} />
              </ActionPanel>
            )}
          </>
        }
      />

      <KeepGoing
        title={live ? 'Save your seat.' : 'Start this course.'}
        body={
          live
            ? 'One click saves your seat for every session. Reminders and the Zoom link come to you.'
            : 'Free to start. Read Week 1 first if you like, then start when it suits you.'
        }
        primary={primary}
        secondary={{ href: '/courses', label: `More from ${LIBRARY_NAME}` }}
      />
    </DirPage>
  )
}
