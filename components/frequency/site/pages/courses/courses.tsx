// /courses under the Frequency design: Creator Lab, Frequency's training library, one shelf per track. Drawn
// with the directory pieces every /discover index shares (dir-parts: the .phero hero, the labelled .sh head,
// the .g3 card grid), so the library reads like the rest of the public site. Server component, no client JS.
//
// Every card links to the course's ONE home (courseHref) and states the same facts in the same order: format
// (live or self-paced), length, certificate. Never /journeys/*: that is the member route, robots.ts disallows it.

import Link from 'next/link'
import type { CourseCard } from '@/lib/courses/library'
import { COURSE_HUB, courseHref, LIBRARY_NAME, type CourseTrack } from '@/lib/courses/tracks'
import { formatMinutes } from '@/components/journey/discovery-widgets'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { count, DirCard, DirEmpty, DirGrid, DirHero, DirPage, DirSection, photo } from '../discover/dir-parts'

const startFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })

/** "January 7": event timestamps hold the host's wall clock, so they read in UTC. */
function runStart(iso: string): string {
  return startFmt.format(new Date(iso))
}

/** The word a shelf counts its course's phases in: the Business of Community runs in weeks, the hosting
 *  courses in parts. */
function unitsFor(track: CourseTrack): [string, string] {
  return track.key === 'business' ? ['week', 'weeks'] : ['part', 'parts']
}

export function FrequencyCourses({ shelves }: { shelves: { track: CourseTrack; courses: CourseCard[] }[] }) {
  const total = shelves.reduce((n, s) => n + s.courses.length, 0)
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[{ label: 'Home', href: '/' }, { label: LIBRARY_NAME }]}
        image={photo('boc-circle-dusk.jpg')}
        title={
          <>
            {LIBRARY_NAME}. Free training for people <em className="fq-iri-text">who gather others.</em>
          </>
        }
        lede="Live workshops and short self-paced courses from Frequency. The business side of community, and the craft of holding a room. Every course tells you who it’s for, when it runs and how long it takes before you start, and the first part of each one is free to read."
      >
        <Link className="btn fq-iri-btn" href="/courses/business-of-community">
          The Business of Community
        </Link>
        <Link className="btn btn-ghost fq-iri-rim" href={COURSE_HUB.path}>
          {COURSE_HUB.label}
        </Link>
      </DirHero>

      {total === 0 ? (
        <DirSection label="The library" title="The first courses are on their way.">
          <DirEmpty
            title="Nothing to start just yet."
            body="The course library is being mapped. Read the guide to building community while you wait."
          >
            <Link className="btn fq-iri-btn" href="/how-to-build-community">
              Read the guide
            </Link>
          </DirEmpty>
        </DirSection>
      ) : (
        shelves.map(({ track, courses }) => {
          const [one, many] = unitsFor(track)
          return (
            <DirSection
              key={track.key}
              id={`track-${track.key}`}
              label={track.label}
              meta={count(courses.length, 'course', 'courses')}
              lede={track.lede}
            >
              <DirGrid label={track.label}>
                {courses.map((c) => (
                  <DirCard
                    key={c.slug}
                    href={courseHref(c.slug)}
                    icon="lesson"
                    image={c.cover}
                    tags={[c.free && 'Free', c.nextRun ? 'Live' : 'Self-paced', c.certificate && 'Certificate']}
                    title={c.title}
                    body={c.summary}
                    meta={[c.nextRun && `Next Run ${runStart(c.nextRun)}`, c.weeks > 0 && count(c.weeks, one, many), formatMinutes(c.minutes)]}
                  />
                ))}
              </DirGrid>
            </DirSection>
          )
        })
      )}

      <KeepGoing
        title="Start with one course."
        body="Pick the one that fits your season. Read the first part free, then save your seat or start when it suits you."
        primary={{ href: '/courses/business-of-community', label: 'The Business of Community' }}
        secondary={{ href: '/discover/journeys', label: 'All Journeys' }}
      />
    </DirPage>
  )
}
