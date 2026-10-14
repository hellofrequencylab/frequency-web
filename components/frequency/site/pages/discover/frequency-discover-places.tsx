// BY TOWN under the Frequency design: /discover/cities (the density-gated towns, then every town with
// something live, since /discover/places merged in on 2026-10-14) and one town's page
// (cities/[citySlug], which renders a density city or any live town in the same CityHub shape).
//
// The figures on a town page are the lengths of the lists printed under them, never a separate count, so
// the number and the page can never disagree. A town section with nothing in it says so plainly instead
// of vanishing, except Spaces, which the DAWN page also leaves out when empty.

import Link from 'next/link'
import type { PublicCircle, PublicEvent } from '@/lib/discover'
import type { NetworkedSpace } from '@/lib/spaces/discovery'
import { BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import {
  DxCalendar,
  DxChips,
  DxCircleCards,
  DxHead,
  DxHero,
  DxNote,
  DxSpaceCards,
  DxStat,
  DxTowns,
  dxPhoto,
} from './parts'
import { FrequencyPlacesFinder, type FinderTown } from './frequency-places-finder'

/** /discover/cities: the towns with real momentum, then every town with something to show up to. */
export function FrequencyCitiesIndex({ cities, towns }: { cities: { city: string; slug: string }[]; towns: FinderTown[] }) {
  return (
    <div className="dx-page">
      <DxHero
        crumbs={[{ href: '/discover', label: 'Discover' }, { label: 'Cities' }]}
        photo={dxPhoto('gathering-03.jpg')}
        title={
          <>
            Where Frequency is <em className="fq-iri-text">taking root.</em>
          </>
        }
        lede="The cities with real momentum: Circles meeting and events happening near you. Pick yours to see what’s happening, then show up in person."
      />
      <section className="dx-sec" data-screen-label="02 Cities">
        <div className="wrap">
          <DxHead label="By city" sub={cities.length > 0 ? `${cities.length} ${cities.length === 1 ? 'city' : 'cities'}` : 'Coming soon'} title="Find your city." />
          {cities.length > 0 ? (
            <DxTowns base="/discover/cities" towns={cities} />
          ) : (
            <DxNote>
              <b>Cities show up here as the community takes root in them.</b>
              <p>Want yours to be one of the first? Start a Circle and bring a few neighbors together.</p>
              <Link className="btn btn-ghost fq-iri-rim" href="/how-to-start-a-circle">
                See how to start a Circle
              </Link>
            </DxNote>
          )}
          {towns.length > 0 && (
            <div className="dx-foot">
              <a className="dx-link" href="#towns">
                Browse every town →
              </a>
            </div>
          )}
        </div>
      </section>
      {towns.length > 0 && (
        <section className="dx-sec" id="towns" data-screen-label="03 Every town">
          <div className="wrap">
            <DxHead label="Where it’s happening" sub="Browse by town" title="Every town here has something to show up to." />
            <FrequencyPlacesFinder towns={towns} />
          </div>
        </section>
      )}
      <KeepGoing
        title="Your city is built one room at a time."
        body="Frequency is free to join, and it stays free. Find a Circle near you, or start the first one."
        primary={{ href: BETA_CTA_HREF, label: `${BETA_CTA_LABEL} →` }}
        secondary={{ href: '/how-to-start-a-circle', label: 'Start a Circle' }}
      />
    </div>
  )
}

/** One town (cities/[citySlug]). */
export function FrequencyTown({
  city,
  base,
  circles,
  events,
  spaces,
  types,
  startOne,
  today,
}: {
  city: string
  /** The index this page sits under (/discover/cities). */
  base: { href: string; label: string }
  circles: PublicCircle[]
  events: PublicEvent[]
  spaces: NetworkedSpace[]
  types: { href: string; label: string; count: number }[]
  /** The "start one here" chapter (the density-gated city page carries it). */
  startOne?: boolean
  today: string
}) {
  return (
    <div className="dx-page">
      <DxHero
        crumbs={[{ href: '/discover', label: 'Discover' }, base, { label: city }]}
        photo={dxPhoto('gathering-04.jpg')}
        title={
          <>
            Find your people in <em className="fq-iri-text">{city}.</em>
          </>
        }
        lede={`Circles are meeting and events are happening in ${city}. Browse them free, then sign up to join one, RSVP, or start your own. Keep coming back and the faces get familiar.`}
      >
        <div className="ctas">
          <a className="btn fq-iri-btn" href="#calendar">
            What’s happening here
          </a>
          <Link className="btn btn-ghost fq-iri-rim" href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL}
          </Link>
        </div>
      </DxHero>

      <section className="dx-sec" data-screen-label="02 At a glance">
        <div className="wrap">
          <dl className="dx-stats">
            <DxStat value={circles.length} label={circles.length === 1 ? 'Circle' : 'Circles'} />
            <DxStat value={events.length} label={events.length === 1 ? 'upcoming event' : 'upcoming events'} />
            {spaces.length > 0 && <DxStat value={spaces.length} label={spaces.length === 1 ? 'local Space' : 'local Spaces'} />}
          </dl>
        </div>
      </section>

      <section className="dx-sec" id="calendar" data-screen-label="03 What’s happening">
        <div className="wrap">
          <DxHead label="What’s happening" sub={city} title={`Coming up in ${city}.`} />
          <DxCalendar
            events={events}
            today={today}
            empty={
              <>
                <b>Nothing on the calendar in {city} yet.</b>
                <p>
                  The Circles here meet on their own rhythm. Join one below, or see{' '}
                  <Link href="/discover/events">what’s happening nearby</Link>.
                </p>
              </>
            }
          />
          {types.length > 0 && (
            <div className="dx-aside">
              <DxHead label="By type" title={`Events by type in ${city}.`} />
              <DxChips label={`Events by type in ${city}`} items={types} />
            </div>
          )}
        </div>
      </section>

      <section className="dx-sec" data-screen-label="04 Circles">
        <div className="wrap">
          <DxHead label="Find your people" sub="Circles" title={`Circles in ${city}.`} lede="Up to fifty neighbors, small enough to know everyone." />
          {circles.length > 0 ? (
            <DxCircleCards circles={circles} />
          ) : (
            <DxNote>
              <b>No public Circle in {city} yet.</b>
              <p>Host the first one: pick one thing, set a standing time, and invite a few people.</p>
              <Link className="btn btn-ghost fq-iri-rim" href="/how-to-start-a-circle">
                See how to start a Circle
              </Link>
            </DxNote>
          )}
        </div>
      </section>

      {spaces.length > 0 && (
        <section className="dx-sec" data-screen-label="05 Local Spaces">
          <div className="wrap">
            <DxHead
              label="Local Spaces"
              sub={city}
              title={`Local Spaces in ${city}.`}
              lede="Studios, shops and organizations with a home here."
            />
            <DxSpaceCards spaces={spaces} />
            <div className="dx-foot">
              <Link className="dx-link" href="/discover/spaces">
                Browse all Spaces →
              </Link>
            </div>
          </div>
        </section>
      )}

      {startOne && (
        <section className="dx-sec" data-screen-label="06 Start one">
          <div className="wrap">
            <DxNote>
              <b>Want to start one in {city}?</b>
              <p>
                You don’t have to build a community. Host one Circle. Pick one thing, set a standing time, and invite
                a few people. We hand you the format and the first-night script.
              </p>
              <Link className="btn btn-ghost fq-iri-rim" href="/how-to-start-a-circle">
                See how to start a Circle
              </Link>
            </DxNote>
          </div>
        </section>
      )}

      <section className="dx-sec" data-screen-label="07 Keep browsing">
        <div className="wrap">
          <DxChips
            label="Other ways to browse"
            items={[
              { href: base.href, label: `All ${base.label.toLowerCase()}` },
              { href: '/discover/circles', label: 'All Circles' },
              { href: '/discover/events', label: 'Everything that’s happening' },
            ]}
          />
        </div>
      </section>

      <KeepGoing
        title={`Your people are already gathering in ${city}.`}
        body="Frequency is free to join, and it stays free. Find a Circle near you and start showing up this week."
        primary={{ href: BETA_CTA_HREF, label: `${BETA_CTA_LABEL} →` }}
        secondary={{ href: base.href, label: `Browse ${base.label.toLowerCase()}` }}
      />
    </div>
  )
}
