// /courses under the Frequency design: Frequency's own courses, one shelf per track. Drawn with the
// directory pieces every /discover index shares (dir-parts: the .phero hero, the labelled .sh head, the
// .g3 card grid), so the library reads like the rest of the public site. Server component, no client JS.
//
// Every card links to the course's sales page when it has one, else to its public Journey page under
// /discover/journeys. Never /journeys/*: that is the member route, and robots.ts disallows it.

import Link from 'next/link'
import type { CourseCard } from '@/lib/courses/library'
import { courseHref, type CourseTrack } from '@/lib/courses/tracks'
import { formatMinutes } from '@/components/journey/discovery-widgets'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { count, DirCard, DirEmpty, DirGrid, DirHero, DirPage, DirSection, photo } from '../discover/dir-parts'

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
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Courses' }]}
        image={photo('gathering-03.jpg')}
        title={
          <>
            Free courses for people <em className="fq-iri-text">who gather others.</em>
          </>
        }
        lede="Short, self-paced courses from Frequency. Learn the business side of hosting, then the craft of holding a room. Each one tells you how long it takes before you start."
      >
        <Link className="btn fq-iri-btn" href="/courses/business-of-community">
          The Business of Community
        </Link>
        <Link className="btn btn-ghost fq-iri-rim" href="/how-to-build-community">
          How to build community
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
                    tags={[c.free && 'Free']}
                    title={c.title}
                    body={c.summary}
                    meta={[c.weeks > 0 && count(c.weeks, one, many), formatMinutes(c.minutes)]}
                  />
                ))}
              </DirGrid>
            </DirSection>
          )
        })
      )}

      <KeepGoing
        title="Start with one course."
        body="Pick the one that fits your season. Read how long it takes, then start when it suits you."
        primary={{ href: '/courses/business-of-community', label: 'The Business of Community' }}
        secondary={{ href: '/discover/journeys', label: 'All Journeys' }}
      />
    </DirPage>
  )
}
