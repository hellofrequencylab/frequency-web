// THE /discover HUB BODY under the Frequency design. Same reads, same sections and the same JSON-LD as the
// DAWN page (app/discover/page.tsx renders the schema for both), drawn in the "site" kit: the hero with the
// live tally (or the founding line under SOCIAL_PROOF_FLOOR), What's happening as date-chip cards, the
// towns, the Channels, the Circles, a chapter photo, the community's newest posts, the questions, and the
// closing band.
//
// The DAWN page draws a Leaflet locator here. Under Frequency the towns render as a LIST: public Circles
// and events carry a city only, and the design's own map stand-in (shared/parts WhatsOnList) is a list for
// the same reason. Each town links to its /discover/cities page (/discover/places merged there, 2026-10-14).

import Link from 'next/link'
import type { PublicCircle, PublicEvent, PublicPost, TopicalChannel } from '@/lib/discover'
import { relativeTime } from '@/lib/utils'
import { BETA_CTA_HREF, BETA_CTA_LABEL, FOUNDING_PLACE, SOCIAL_PROOF_FLOOR } from '@/lib/site'
import { citySlug } from '@/app/discover/events/_data'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { FqIcon } from '@/components/frequency/icon'
import { SITE } from '../shared/links'
import { DxCalendar, DxChapter, DxCircleCards, DxHead, DxHero, DxNote, DxTowns, dxPhoto } from './parts'

export interface HubTown {
  city: string
  circles: number
  events: number
}

export function FrequencyDiscoverHub({
  counts,
  events,
  circles,
  channels,
  towns,
  posts,
  faqs,
  today,
}: {
  counts: { members: number; circles: number }
  events: PublicEvent[]
  circles: PublicCircle[]
  channels: { channel: TopicalChannel; circles: number }[]
  towns: HubTown[]
  posts: PublicPost[]
  faqs: { q: string; a: string }[]
  today: string
}) {
  const proven = counts.members >= SOCIAL_PROOF_FLOOR
  return (
    <div className="dx-page">
      <DxHero
        crumbs={[{ label: 'Discover' }]}
        photo={dxPhoto('day-meditation-circle.jpg')}
        energy="charge"
        title={
          <>
            Real community, <em className="fq-iri-text">near you.</em>
          </>
        }
        lede="Somewhere close to you, your people are already meeting this week. A standing time, a handful of regulars, a seat that gets noticed when it’s empty. Browse for free; sign up to join a Circle, RSVP, or post."
      >
        {proven ? (
          // Members and Circles only: the hub reads just the next four events, so `events.length` is a page
          // size, not a count, and printing it as "4 upcoming events" would undercount the calendar.
          <p className="dx-hp">
            <b>{counts.members}</b> members · <b>{counts.circles}</b> Circles
          </p>
        ) : (
          <p className="dx-hp">Forming now in {FOUNDING_PLACE}. Explore the first Circles, Channels and events below.</p>
        )}
        <div className="ctas">
          <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL}
          </Link>
          <a className="btn btn-ghost fq-iri-rim" href="#happening">
            Just browse, no account needed
          </a>
        </div>
      </DxHero>

      <section className="dx-sec" id="happening" data-screen-label="02 What’s happening">
        <div className="wrap">
          <DxHead
            label="What’s happening"
            sub="Coming up"
            title="Show up this week."
            lede="Real plans, on real days, with room for you. Pick one, RSVP, and you’re expected."
          />
          <DxCalendar
            events={events}
            today={today}
            empty={
              <>
                <b>The calendar is quiet for now.</b>
                <p>
                  Every standing time starts with one gathering someone put on the calendar. Join free and you’ll
                  hear when the first one near you lands.
                </p>
                <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
                  {BETA_CTA_LABEL}
                </Link>
              </>
            }
          />
          {events.length > 0 && (
            <div className="dx-foot">
              <Link className="btn btn-ghost fq-iri-rim" href="/discover/events">
                See everything that’s happening →
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="dx-sec" data-screen-label="03 Towns">
        <div className="wrap">
          <DxHead
            label="Where it’s happening"
            sub="Towns"
            title="Find your area."
            lede="Each town here has real Circles meeting or events coming up. Close enough to walk to, small enough that you’re missed when you don’t come."
          />
          {towns.length > 0 ? (
            <>
              <DxTowns
                base="/discover/cities"
                towns={towns.map((t) => ({ city: t.city, slug: citySlug(t.city), circles: t.circles, events: t.events }))}
              />
              <div className="dx-foot">
                <Link className="dx-link" href="/discover/cities#towns">
                  Browse every town →
                </Link>
              </div>
            </>
          ) : (
            <DxNote>
              <b>We’re starting in {FOUNDING_PLACE}.</b>
              <p>The first Circles are forming now. Be one of the first in your neighborhood.</p>
              <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
                {BETA_CTA_LABEL}
              </Link>
            </DxNote>
          )}
        </div>
      </section>

      {channels.length > 0 && (
        <section className="dx-sec" data-screen-label="04 Channels">
          <div className="wrap">
            <DxHead
              label="Explore by Channel"
              sub="What you love"
              title="Find what you practice."
              lede="Movement, spirituality, creative. Pick the Channel that’s calling you, and on the other side of it is a Circle living it near you."
            />
            <div className="g3 dx-cards">
              {channels.map(({ channel, circles: n }) => (
                <Link key={channel.id} className="pc dx-card" href={`/discover/topics/${channel.slug}`}>
                  <span className="ic" aria-hidden="true">
                    <FqIcon name="compass" />
                  </span>
                  <h3>{channel.name}</h3>
                  {channel.description && <p className="dx-clamp">{channel.description}</p>}
                  <span className="dx-meta">
                    <span>
                      {n} {n === 1 ? 'Circle' : 'Circles'}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="dx-foot">
              <Link className="dx-link" href="/discover/topics">
                Browse all Channels →
              </Link>
            </div>
          </div>
        </section>
      )}

      <DxChapter
        label="Why we show up"
        sub="In person"
        title="Somewhere that keeps a seat for you."
        photo={dxPhoto('night-string-lights-web.jpg')}
        alt="Friends gathered at a long table under string lights at night"
      >
        <p className="body-l">
          People are steadier and more themselves when they belong to a group that knows them. Not a follower
          count. A handful of faces that light up when you walk in.
        </p>
        <p className="body-l">
          Every Circle and every event here is a standing invitation to show up in person, next to neighbors who
          notice the week you go quiet.
        </p>
      </DxChapter>

      {circles.length > 0 && (
        <section className="dx-sec" data-screen-label="06 Circles">
          <div className="wrap">
            <DxHead
              label="Find your people"
              sub="Circles forming now"
              title="Up to fifty neighbors, small enough to know everyone."
            />
            <DxCircleCards circles={circles} />
            <div className="dx-foot">
              <Link className="dx-link" href="/discover/circles">
                Browse all Circles →
              </Link>
            </div>
          </div>
        </section>
      )}

      {posts.length > 0 && (
        <section className="dx-sec" data-screen-label="07 From the community">
          <div className="wrap">
            <DxHead label="From the community" sub="What people are saying" title="Overheard this week." />
            <div className="dx-posts">
              {posts.map((p) => (
                <article key={p.id} className="dx-post">
                  <p>{p.body}</p>
                  <footer>
                    {p.author_handle ? (
                      <Link href={`/people/${p.author_handle}`}>
                        <b>{p.author_display_name ?? 'Community member'}</b>
                      </Link>
                    ) : (
                      <b>{p.author_display_name ?? 'Community member'}</b>
                    )}
                    <span>{relativeTime(p.created_at)}</span>
                  </footer>
                </article>
              ))}
            </div>
            <div className="dx-foot">
              <Link className="dx-link" href={BETA_CTA_HREF}>
                Join to see the full feed →
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="dx-sec" data-screen-label="08 Questions">
        <div className="wrap">
          <DxHead label="Good to know" sub="Questions" title="The ones everyone asks." />
          <div className="qa">
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title="Ready to find your people?"
        body="Frequency is free to join. Find a Circle near you and start showing up this week."
        primary={{ href: BETA_CTA_HREF, label: `${BETA_CTA_LABEL} →` }}
        secondary={{ href: SITE.people, label: 'How it works for people' }}
      />
    </div>
  )
}
