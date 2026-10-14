// WHAT'S HAPPENING under the Frequency design: /discover/events, the city x type hubs under it, and a host's
// public page. NAMING calls the calendar surface "What's happening" (templates/website/README.md, copy canon).
//
// The DAWN /discover/events page printed up to fifty events as one column of rows. Here they are the design's
// date-chip cards in this-week / next-week / month buckets, the first twelve open and the rest behind a
// native disclosure (./group.ts), so the whole calendar is still in the HTML the JSON-LD describes.
//
// Every figure is a real read: the proof strip prints members, Circles and upcoming events only at or above
// SOCIAL_PROOF_FLOOR and the founding line below it (./parts DxProof). Events are city-level only; the venue
// is on the event page after an RSVP (ADR-186, ADR-1743/1744).

import Image from 'next/image'
import Link from 'next/link'
import type { PublicEvent } from '@/lib/discover'
import { getInitials } from '@/lib/utils'
import { avatarFocusStyle, avatarSrc } from '@/lib/images/avatar-focus'
import { BETA_CTA_HREF, BETA_CTA_LABEL, FOUNDING_PLACE } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { SITE } from '../shared/links'
import { DxAsk, DxCalendar, DxChapter, DxChips, DxHead, DxHero, DxNote, DxProof, dxPhoto } from './parts'

const PRIVACY_LINE = 'Public pages show the town only; the exact venue is shared with members who RSVP.'

export interface TownTypeLink {
  href: string
  label: string
  count: number
}

/** /discover/events: the whole public calendar. */
export function FrequencyDiscoverEvents({
  events,
  counts,
  townTypes,
  today,
}: {
  events: PublicEvent[]
  counts: { members: number; circles: number }
  townTypes: TownTypeLink[]
  today: string
}) {
  return (
    <div className="dx-page">
      <DxHero
        crumbs={[{ href: '/discover', label: 'Discover' }, { label: 'What’s happening' }]}
        photo={dxPhoto('day-parachute-play.jpg')}
        energy="charge"
        title={
          <>
            Show up <em className="fq-iri-text">this week.</em>
          </>
        }
        lede={`A sunrise on the bluff. A cold plunge. A supper table with a seat saved for you. Real plans, on real days, with neighbors who notice if you don’t come. ${PRIVACY_LINE}`}
      >
        <div className="ctas">
          <a className="btn fq-iri-btn" href="#calendar">
            See what’s happening
          </a>
          <Link className="btn btn-ghost fq-iri-rim" href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL}
          </Link>
        </div>
      </DxHero>

      <section className="dx-sec" id="calendar" data-screen-label="02 What’s happening">
        <div className="wrap">
          <DxHead
            label="What’s happening"
            sub={events.length > 0 ? `${events.length} coming up` : 'Founding chapter'}
            title={events.length > 0 ? 'Pick one, RSVP, and you’re expected.' : 'The first gathering hasn’t happened yet.'}
            lede={
              events.length > 0
                ? 'The kind of plan that pulls you off the couch and into a room. Find the one that sounds like your morning, and let a few neighbors start to know your face.'
                : undefined
            }
          />
          <DxCalendar
            events={events}
            today={today}
            empty={
              <>
                <b>The calendar is quiet for now.</b>
                <p>
                  We’re just getting started in {FOUNDING_PLACE}. Every standing time starts the same way: one
                  sunrise, one cold plunge, one supper that someone put on the calendar. Join free and you’ll be
                  among the first to know when the first one lands.
                </p>
                <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
                  {BETA_CTA_LABEL}
                </Link>
              </>
            }
          />
          {events.length > 0 && (
            <div className="dx-aside">
              <DxProof members={counts.members} circles={counts.circles} events={events.length} />
              <DxAsk
                title="Want to be at one of these?"
                body="RSVP, see the exact venue, and let a few neighbors start to know your face."
                href={BETA_CTA_HREF}
                label={BETA_CTA_LABEL}
              />
            </div>
          )}
        </div>
      </section>

      {townTypes.length > 0 && (
        <section className="dx-sec" data-screen-label="03 By town and type">
          <div className="wrap">
            <DxHead label="By town and type" sub="Narrow it down" title="Your town, your kind of night." />
            <DxChips label="Events by town and type" items={townTypes} />
          </div>
        </section>
      )}

      {events.length > 0 && (
        <DxChapter
          label="Why in person"
          sub="The room"
          title="The room does what the feed can’t."
          photo={dxPhoto('day-park-yoga.jpg')}
          alt="An outdoor class on the grass, mats laid out in rows"
          rev
        >
          <p className="body-l">
            Mats laid out in rows on the grass. A circuit that runs you from heat to cold and hands you back calmer
            than you arrived. None of it survives a screen. You have to be in the room.
          </p>
          <p className="body-l">
            The second time you come, you’re not a stranger anymore. Friendship happens in person, and the faces you
            half-recognize are already there, saving you a spot.
          </p>
        </DxChapter>
      )}

      <KeepGoing
        title="See you there."
        body="Joining is free. RSVP to gatherings, meet your neighbors, and help shape what we build next."
        primary={{ href: BETA_CTA_HREF, label: `${BETA_CTA_LABEL} →` }}
        secondary={{ href: '/discover/cities', label: 'Browse by town' }}
      />
    </div>
  )
}

/** /discover/events/in/[city]/[category]: one type of event in one town. Only rendered with ≥1 event. */
export function FrequencyEventHub({
  city,
  label,
  noun,
  nounSingular,
  events,
  siblings,
  today,
}: {
  city: string
  label: string
  noun: string
  nounSingular: string
  events: PublicEvent[]
  siblings: TownTypeLink[]
  today: string
}) {
  return (
    <div className="dx-page">
      <DxHero
        crumbs={[
          { href: '/discover', label: 'Discover' },
          { href: '/discover/events', label: 'What’s happening' },
          { label: `${label} in ${city}` },
        ]}
        photo={dxPhoto('gathering-05.jpg')}
        title={
          <>
            {label} in <em className="fq-iri-text">{city}.</em>
          </>
        }
        lede={`Every ${nounSingular} coming up in ${city}. Pick one, RSVP, and you’re expected. ${PRIVACY_LINE}`}
      >
        <div className="ctas">
          <a className="btn fq-iri-btn" href="#calendar">
            See the dates
          </a>
          <Link className="btn btn-ghost fq-iri-rim" href="/discover/events">
            Everything that’s happening
          </Link>
        </div>
      </DxHero>

      <section className="dx-sec" id="calendar" data-screen-label="02 Calendar">
        <div className="wrap">
          <DxHead
            label="What’s happening"
            sub={`${events.length} upcoming`}
            title={`${events.length === 1 ? 'One' : events.length} ${events.length === 1 ? nounSingular : noun} in ${city}.`}
          />
          <DxCalendar
            events={events}
            today={today}
            empty={
              <p>
                Nothing on the calendar here right now. <Link href="/discover/events">See what’s happening nearby.</Link>
              </p>
            }
          />
          {siblings.length > 0 && (
            <div className="dx-aside">
              <DxHead label={`More in ${city}`} title="Other kinds of nights here." />
              <DxChips label={`More events in ${city}`} items={siblings} />
            </div>
          )}
        </div>
      </section>

      <KeepGoing
        title="See you there."
        body={`Joining is free. RSVP to ${noun} in ${city}, meet your neighbors, and get the exact venue.`}
        primary={{ href: BETA_CTA_HREF, label: `${BETA_CTA_LABEL} →` }}
        secondary={{ href: '/discover/events', label: 'Everything that’s happening' }}
      />
    </div>
  )
}

/** /discover/events/organizer/[handle]: a host's public calendar, upcoming and recently hosted. */
export function FrequencyOrganizer({
  displayName,
  avatarUrl,
  upcoming,
  past,
  today,
}: {
  displayName: string
  avatarUrl: string | null
  upcoming: PublicEvent[]
  past: PublicEvent[]
  today: string
}) {
  return (
    <div className="dx-page">
      <DxHero
        crumbs={[
          { href: '/discover', label: 'Discover' },
          { href: '/discover/events', label: 'What’s happening' },
          { label: displayName },
        ]}
        photo={dxPhoto('gathering-08.jpg')}
        energy="still"
        badge={
          <span className="dx-av" aria-hidden={avatarUrl ? undefined : true}>
            {avatarUrl ? (
              <Image src={avatarSrc(avatarUrl)} alt={displayName} width={64} height={64} style={avatarFocusStyle(avatarUrl)} />
            ) : (
              getInitials(displayName)
            )}
          </span>
        }
        title={displayName}
        lede={`Real-world gatherings, in one place. ${PRIVACY_LINE}`}
      >
        <div className="ctas">
          <a className="btn fq-iri-btn" href="#calendar">
            {upcoming.length > 0 ? 'See what’s coming up' : 'Follow along'}
          </a>
        </div>
      </DxHero>

      <section className="dx-sec" id="calendar" data-screen-label="02 Coming up">
        <div className="wrap">
          <DxHead
            label="What’s happening"
            sub="Coming up"
            title={upcoming.length > 0 ? 'Pick one, RSVP, and you’re expected.' : 'Nothing on the public calendar right now.'}
          />
          {/* The host RPC carries no price, so the cards make no price claim (price={false}). */}
          <DxCalendar
            events={upcoming}
            today={today}
            price={false}
            empty={
              <p>
                {displayName} doesn’t have a public event up at the moment. The next one shows up here as soon as
                it’s posted.
              </p>
            }
          />
          <div className="dx-aside">
            <DxNote>
              <b>Want these on your calendar?</b>
              <p>
                <Link href="/sign-in">Sign in</Link> and subscribe once. The events you RSVP to land in Google or
                Apple Calendar and stay current on their own.
              </p>
            </DxNote>
          </div>
        </div>
      </section>

      {past.length > 0 && (
        <section className="dx-sec dx-past" data-screen-label="03 Recently hosted">
          <div className="wrap">
            <DxHead label="Already happened" sub="Recently hosted" title="A sense of the rooms this host puts together." />
            <DxCalendar events={past} today={today} price={false} past limit={6} empty={null} />
          </div>
        </section>
      )}

      <KeepGoing
        title="Show up to the next one."
        body="Sign up free to RSVP, see who else is coming, and get the exact venue."
        primary={{ href: BETA_CTA_HREF, label: `${BETA_CTA_LABEL} →` }}
        secondary={{ href: SITE.people, label: 'How it works for people' }}
      />
    </div>
  )
}
