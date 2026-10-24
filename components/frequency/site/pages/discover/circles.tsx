// /discover/circles and /discover/circles/[id] under the Frequency design. The pages keep every read,
// redirect, metadata line and JSON-LD node; these bodies only draw what they read in the site kit.
//
// Every Circle shown is one the public read lists (public_circle_by_id / the discover RPC), so a
// "private" Circle, which means unlisted (docs/NAMING.md), never reaches either body. The join action
// is the same door the DAWN page uses (BETA_CTA_HREF), and the community proof keeps its honesty rule:
// real counts at SOCIAL_PROOF_FLOOR and above, founding copy below it.

import Link from 'next/link'
import type { PublicCircle } from '@/lib/discover'
import { BETA_CTA_HREF, BETA_CTA_LABEL, FOUNDING_PLACE, SOCIAL_PROOF_FLOOR } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import {
  ActionPanel,
  count,
  DetailBody,
  DirCard,
  DirChips,
  DirEmpty,
  DirGrid,
  DirHero,
  DirPage,
  DirSection,
  Fact,
  photo,
} from './dir-parts'

function circleHref(c: Pick<PublicCircle, 'slug' | 'id'>) {
  return `/discover/circles/${c.slug ?? c.id}`
}

/** The proof line: real numbers only once there are enough of them to mean something. */
function proofLine(counts: { members: number; circles: number }, events: number): string {
  if (counts.members < SOCIAL_PROOF_FLOOR) {
    return `The first Circles are taking root in ${FOUNDING_PLACE}. The founding members are shaping what this becomes. Come be one of them.`
  }
  return `Across Frequency: ${count(counts.members, 'member', 'members')}, ${count(counts.circles, 'Circle', 'Circles')} and ${count(events, 'upcoming event', 'upcoming events')}.`
}

export function FrequencyCircles({
  circles,
  counts,
  events,
}: {
  circles: PublicCircle[]
  counts: { members: number; circles: number }
  events: number
}) {
  // The Channels these Circles gather around, as doors to each Channel's own page. Read off the
  // Circles themselves, so a chip never leads to an empty room.
  const channels = new Map<string, string>()
  for (const c of circles) if (c.channel_slug && c.channel_name) channels.set(c.channel_slug, c.channel_name)

  return (
    <DirPage side="p">
      <DirHero
        crumbs={[{ label: 'Discover', href: '/discover' }, { label: 'Circles' }]}
        image={photo('day-meditation-circle.jpg')}
        title={
          <>
            Circles forming <em className="fq-iri-text">near you.</em>
          </>
        }
        lede="Want a regular time to meet people? A Circle gathers around a practice, a place or something people like doing. Browse the community groups listed here, then check how to join."
      >
        <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
          {BETA_CTA_LABEL}
        </Link>
        <a className="btn btn-ghost fq-iri-rim" href="#circles">
          Browse the Circles
        </a>
      </DirHero>

      <DirSection
        id="circles"
        label="Near you"
        meta={circles.length > 0 ? count(circles.length, 'Circle', 'Circles') : null}
        title="Find the one you’d show up to."
        lede="Read each Circle’s activity, meeting times and access details. Ask the Host how to take part before you go."
      >
        {channels.size > 1 && (
          <DirChips
            label="Browse Circles by Channel"
            chips={[...channels].map(([slug, name]) => ({ href: `/discover/topics/${slug}`, label: name, on: false }))}
          />
        )}
        {circles.length === 0 ? (
          <DirEmpty
            title="No public Circles yet."
            body="You can start with one activity and a regular time. Sign up to create a Circle and invite a few people."
          >
            <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
              Start a Circle
            </Link>
          </DirEmpty>
        ) : (
          <DirGrid label="Circles">
            {circles.map((c) => (
              <DirCard
                key={c.id}
                href={circleHref(c)}
                icon="circle"
                kicker={c.channel_name}
                tags={[c.status === 'forming' && 'Forming', c.type === 'online' && 'Online']}
                title={c.name}
                body={c.about}
                meta={[count(c.member_count, 'member', 'members'), c.city]}
              />
            ))}
          </DirGrid>
        )}
        <p className="body-l" style={{ marginTop: 28 }}>
          {proofLine(counts, events)}
        </p>
      </DirSection>

      <DirSection label="How Circles grow" title="A Circle divides to stay close.">
        <div className="blocks">
          <div className="block">
            <h3>Small on purpose.</h3>
            <p>
              Circles have up to fifty people. A regular time and shared activity give members a place to meet again.
            </p>
          </div>
          <div className="block">
            <h3>Two rooms, not one crowded one.</h3>
            <p>
              If a group needs another gathering, a regular can host a second Circle. Choose a time and share the invitation.
            </p>
          </div>
        </div>
      </DirSection>

      <KeepGoing
        title="Find a Circle you would like to try."
        body="Joining is free, and it stays free. Step inside a Circle near you, or start one of your own."
        primary={{ href: BETA_CTA_HREF, label: BETA_CTA_LABEL }}
        secondary={{ href: '/discover/topics', label: 'Browse by Channel' }}
      />
    </DirPage>
  )
}

export function FrequencyCircle({ circle, image }: { circle: PublicCircle; image: string | null | undefined }) {
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[
          { label: 'Discover', href: '/discover' },
          { label: 'Circles', href: '/discover/circles' },
          { label: circle.name },
        ]}
        image={image || photo('gathering-03.jpg')}
        title={circle.name}
        facts={
          <>
            <Fact icon="user">{count(circle.member_count, 'member', 'members')}</Fact>
            {circle.city && <Fact icon="pin">{circle.city}</Fact>}
            {circle.type === 'online' && <Fact icon="globe">Online</Fact>}
            {circle.status === 'forming' && <Fact icon="streak">Forming</Fact>}
            {circle.channel_name && circle.channel_slug && (
              <Fact icon="compass">
                <Link href={`/discover/topics/${circle.channel_slug}`}>{circle.channel_name}</Link>
              </Fact>
            )}
          </>
        }
      />

      <DetailBody
        main={
          <section>
            <h2>About this Circle</h2>
            <p className="dd-prose">
              {circle.about ??
                'A Circle around a shared activity. Read the listing for its format, meeting time, location and how to join.'}
            </p>
          </section>
        }
        side={
          <ActionPanel title={`Want in on ${circle.name}?`}>
            <p>
              Read this Circle’s details and standing times. Sign up to request a place, and ask the Host if you have a question before you come.
            </p>
            <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
              {BETA_CTA_LABEL}
            </Link>
            <Link className="btn btn-ghost" href="/discover/circles">
              More Circles
            </Link>
          </ActionPanel>
        }
      />
    </DirPage>
  )
}
