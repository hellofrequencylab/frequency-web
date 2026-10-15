// /discover/topics (Channels, grouped under their Pillar) and /discover/topics/[slug] (one Channel and
// the Circles gathering around it) under the Frequency design. The pages keep their reads, metadata and
// JSON-LD; these bodies draw them in the site kit. Canon: Pillar > Channel > Circle (docs/NAMING.md).

import Link from 'next/link'
import type { PublicCircle, TopicalChannel } from '@/lib/discover'
import { BETA_CTA_HREF, BETA_CTA_LABEL, FOUNDING_PLACE, SOCIAL_PROOF_FLOOR } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { count, DirCard, DirEmpty, DirGrid, DirHero, DirPage, DirSection, photo } from './dir-parts'

export interface PillarGroup {
  id: string
  name: string
  description: string | null
  topics: (TopicalChannel & { circleCount: number })[]
}

export function FrequencyTopics({
  sections,
  counts,
  events,
}: {
  sections: PillarGroup[]
  counts: { members: number; circles: number }
  events: number
}) {
  const proof =
    counts.members < SOCIAL_PROOF_FLOOR
      ? `The first Circles are taking root in ${FOUNDING_PLACE}. The founding members are shaping what this becomes.`
      : `Already happening in ${FOUNDING_PLACE}: ${count(counts.members, 'member', 'members')}, ${count(counts.circles, 'Circle', 'Circles')} and ${count(events, 'upcoming event', 'upcoming events')}.`
  return (
    <DirPage side="p">
      <DirHero compact
        crumbs={[{ label: 'Discover', href: '/discover' }, { label: 'Channels' }]}
        image={photo('day-beach-hoop.jpg')}
        title={
          <>
            Find what you <em className="fq-iri-text">practice.</em>
          </>
        }
        lede="A Channel is the thing neighbors already gather around. Pick the one you’d show up for, and on the other side of it is a Circle practicing it near you."
      >
        <Link className="btn fq-iri-btn" href="/discover/circles">
          Browse Circles instead
        </Link>
      </DirHero>

      <DirSection
        label="The Channels"
        meta="Sorted by Pillar"
        title="One name that finds your people."
        lede="Say what you practice and you skip the small talk."
      >
        {sections.length === 0 ? (
          <DirEmpty title="No Channels yet." body="The first Channels are being set up. Check back soon, or browse the Circles already meeting.">
            <Link className="btn fq-iri-btn" href="/discover/circles">
              Browse Circles
            </Link>
          </DirEmpty>
        ) : (
          sections.map((pillar) => (
            <div className="dd-group" key={pillar.id}>
              <h3>{pillar.name}</h3>
              {pillar.description && <p>{pillar.description}</p>}
              <DirGrid label={`${pillar.name} Channels`}>
                {pillar.topics.map((ch) => (
                  <DirCard
                    key={ch.id}
                    href={`/discover/topics/${ch.slug}`}
                    icon="compass"
                    image={ch.cover_image}
                    title={ch.name}
                    body={ch.description}
                    meta={[ch.circleCount > 0 ? count(ch.circleCount, 'Circle', 'Circles') : 'No Circles yet']}
                  />
                ))}
              </DirGrid>
            </div>
          ))
        )}
        <p className="body-l" style={{ marginTop: 28 }}>
          {proof}
        </p>
      </DirSection>

      <KeepGoing
        title="Find your people."
        body="Claim your spot and find the Circle practicing what you love."
        primary={{ href: BETA_CTA_HREF, label: BETA_CTA_LABEL }}
        secondary={{ href: '/discover/circles', label: 'Browse Circles' }}
      />
    </DirPage>
  )
}

export function FrequencyTopic({
  channel,
  circles,
  image,
}: {
  channel: TopicalChannel
  circles: PublicCircle[]
  image: string | null | undefined
}) {
  const lower = channel.name.toLowerCase()
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[
          { label: 'Discover', href: '/discover' },
          { label: 'Channels', href: '/discover/topics' },
          { label: channel.name },
        ]}
        image={image || photo('gathering-11.jpg')}
        title={channel.name}
        lede={
          channel.description ??
          `One doorway into a room of people. Name ${lower} as the thing you practice and you land among neighbors who lit up the same way you did.`
        }
      />
      <DirSection
        label="Circles"
        meta={circles.length > 0 ? `${count(circles.length, 'Circle', 'Circles')} in ${channel.name}` : null}
        title={`Where ${lower} meets in person.`}
      >
        {circles.length === 0 ? (
          <DirEmpty
            title={`No Circles in ${channel.name} yet.`}
            body={`Every Circle begins with one person and a standing time. Gather your neighbors around ${lower}, and the next person who comes looking finds your room already warm.`}
          >
            <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
              Start a Circle
            </Link>
          </DirEmpty>
        ) : (
          <DirGrid label={`${channel.name} Circles`}>
            {circles.map((c) => (
              <DirCard
                key={c.id}
                href={`/discover/circles/${c.slug ?? c.id}`}
                icon="circle"
                tags={[c.status === 'forming' && 'Forming', c.type === 'online' && 'Online']}
                title={c.name}
                body={c.about}
                meta={[count(c.member_count, 'member', 'members'), c.city]}
              />
            ))}
          </DirGrid>
        )}
      </DirSection>
      <KeepGoing
        title={`Join the ${channel.name} community.`}
        body={`Sign up free to tune in to ${lower}, find a Circle living it near you, and start showing up.`}
        primary={{ href: '/sign-in', label: 'Sign up free' }}
        secondary={{ href: '/discover/topics', label: 'All Channels' }}
      />
    </DirPage>
  )
}
