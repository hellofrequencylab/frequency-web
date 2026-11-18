// /courses/<slug>/week-1: the first part of a course, in full, free to read. Same kit as the course page
// (dir-parts), a reading column of the steps beside the one action. Lesson bodies are the author's Markdown,
// drawn by the help center's renderer in its bare mode so this page's own styles dress the prose.

import Link from 'next/link'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { LIBRARY_NAME } from '@/lib/courses/tracks'
import type { CoursePart } from '@/lib/courses/first-part'
import { runLabel } from '@/lib/courses/run-format'
import type { CourseView } from './course'
import { ActionPanel, DetailBody, DirHero, DirPage, Fact, photo } from '../discover/dir-parts'
import { CourseLeadForm } from './course-lead-form'

const KIND: Record<string, string> = {
  reading: 'Read',
  lesson: 'Lesson',
  exercise: 'Do',
  reflection: 'Reflect',
  resource: 'Resource',
  practice: 'Practice',
}

export function FrequencyCourseWeek({ v, part }: { v: CourseView; part: CoursePart }) {
  const run = runLabel(v.sessions)
  const first = v.sessions[0]
  const minutes = part.steps.reduce((n, s) => n + (s.minutes ?? 0), 0)
  const primary = first
    ? { href: `/events/${first.slug}`, label: 'Save your seat' }
    : { href: v.startHref, label: 'Start the course free' }
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[
          { label: 'Home', href: '/' },
          { label: LIBRARY_NAME, href: '/courses' },
          { label: v.title, href: v.path },
          { label: part.title },
        ]}
        image={v.image || photo('gathering-03.jpg')}
        title={part.title}
        lede={`Free to read from ${v.title}. No account needed.`}
        facts={
          <>
            <Fact icon="lesson">{part.steps.length} steps</Fact>
            {minutes > 0 && <Fact icon="clock">About {minutes} minutes</Fact>}
            {run && <Fact icon="event">Live: {run}</Fact>}
          </>
        }
      />
      <DetailBody
        main={
          <article className="dd-week">
            {part.intro && <p className="dd-prose">{part.intro}</p>}
            {part.steps.map((s) => (
              <section key={s.id} id={`step-${s.id}`}>
                <h2>
                  {s.title}
                  <small>{[KIND[s.kind] ?? 'Step', s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(' · ')}</small>
                </h2>
                {s.body ? <HelpMarkdown bare>{s.body}</HelpMarkdown> : null}
              </section>
            ))}
            <p className="dd-prose">
              That’s the first part. The rest of the course is on <Link href={v.path}>the course page</Link>.
            </p>
          </article>
        }
        side={
          <>
            <ActionPanel title={first ? 'Join the next Run' : 'Keep going'}>
              <p>
                {first
                  ? `${run}, live on Zoom. Free. Save your seat once and you’re in for every session.`
                  : 'The rest of the course is free on Frequency. Make an account and pick up where this leaves off.'}
              </p>
              <Link className="btn fq-iri-btn" href={primary.href}>
                {primary.label}
              </Link>
              <Link className="btn btn-ghost fq-iri-rim" href={v.path}>
                About the course
              </Link>
            </ActionPanel>
            <ActionPanel title="Read it later">
              <p>Send this part to your inbox{first ? ', with the dates' : ''}.</p>
              <CourseLeadForm slug={v.slug} />
            </ActionPanel>
          </>
        }
      />
      <KeepGoing
        title={first ? 'Bring this to the first session.' : 'Pick up where this leaves off.'}
        body={
          first
            ? 'Do the reading, then come practice it live with others. One click saves your seat for the whole Run.'
            : 'The rest of the course is free. Start it when it suits you.'
        }
        primary={primary}
        secondary={{ href: '/courses', label: `More from ${LIBRARY_NAME}` }}
      />
    </DirPage>
  )
}
