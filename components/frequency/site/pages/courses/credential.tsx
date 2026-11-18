// /credentials/<id> under the Frequency design: the credential, its badge, what the level means, and the
// course it came from. Server component; the share button is the one client island.

import Link from 'next/link'
import { ShareButton } from '@/components/discover/share-button'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { LIBRARY_NAME } from '@/lib/courses/tracks'
import type { PublicCredential } from '@/lib/courses/credentials'
import { SITE_NAME } from '@/lib/site'
import { ActionPanel, DetailBody, DirHero, DirPage, Fact, photo } from '../discover/dir-parts'

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const MEANS: Record<PublicCredential['level'], string> = {
  attended: 'Came to every live session of a Run of this course.',
  certified:
    'Ran the course’s meetings with their own people and sent in the pages to show it. A Frequency reviewer read them and signed off. A certificate of completion and competency from Frequency, not an accredited certification.',
}

export function FrequencyCredential({ c, coursePath }: { c: PublicCredential; coursePath: string }) {
  const label = c.level === 'certified' ? 'Certified' : 'Attended'
  const path = `/credentials/${c.id}`
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[{ label: 'Home', href: '/' }, { label: LIBRARY_NAME, href: '/courses' }, { label: 'Credential' }]}
        image={photo('boc-circle-dusk.jpg')}
        title={c.revoked ? 'This credential was withdrawn.' : `${c.holder.name} is ${label.toLowerCase()}.`}
        lede={c.revoked ? `It was issued for ${c.course.title} and is no longer current.` : `${c.course.title}, a ${LIBRARY_NAME} course from ${SITE_NAME}.`}
        facts={
          <>
            <Fact icon="award">{label}</Fact>
            <Fact icon="event">Issued {dateFmt.format(new Date(c.issuedAt))}</Fact>
          </>
        }
      />
      <DetailBody
        main={
          <>
            {!c.revoked && (
              <section>
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG badge served by this site */}
                <img src={`${path}/badge.svg`} alt={`${label}: ${c.course.title}`} width={240} height={240} />
              </section>
            )}
            <section>
              <h2>What {label} means</h2>
              <p className="dd-prose">{MEANS[c.level]}</p>
            </section>
            <section>
              <h2>The course</h2>
              <p className="dd-prose">
                <Link href={coursePath}>{c.course.title}</Link> is part of {LIBRARY_NAME}, Frequency’s free training
                library for people who gather others.
              </p>
            </section>
          </>
        }
        side={
          !c.revoked ? (
            <ActionPanel title="Share it">
              <p>Anyone with this link can check it. Add the badge to your Space or your site.</p>
              <ShareButton path={path} title={`${c.holder.name}: ${label}, ${c.course.title}`} text={`${label} in ${c.course.title}.`} label="Share" />
              <a className="btn btn-ghost fq-iri-rim" href={`${path}/badge.svg`} download>
                Download the badge
              </a>
              {c.holder.handle && (
                <Link className="btn btn-ghost fq-iri-rim" href={`/people/${c.holder.handle}`}>
                  {c.holder.name}’s profile
                </Link>
              )}
            </ActionPanel>
          ) : (
            <ActionPanel title="The course">
              <Link className="btn fq-iri-btn" href={coursePath}>
                See the course
              </Link>
            </ActionPanel>
          )
        }
      />
      <KeepGoing
        title="Take the course yourself."
        body="It’s free. Read the first part, then save your seat for the next Run."
        primary={{ href: coursePath, label: c.course.title }}
        secondary={{ href: '/courses', label: `More from ${LIBRARY_NAME}` }}
      />
    </DirPage>
  )
}
