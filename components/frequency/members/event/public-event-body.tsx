import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/active/kit-members'
import '@/app/themes/active/members-b'
import { FqIcon } from '@/components/frequency/icon'
import { FqEventMap } from './event-map'
import { PublicEventChat } from './public-event-chat'

// THE PUBLIC EVENT PAGE, FREQUENCY BODY, for the signed-out share URL /events/<slug>. The member page draws
// the same reference through FqEventBody; this twin exists because that body's panels read the request (the
// cookie client), and this page is ISR: one cookie read here would turn every shared event link into a
// per-request render (lib/nav/public-detail-isr).
//
// THE ANATOMY (owner, 2026-10-14: "a killer best practice event design with Frequency vibes"): the event's
// own cover, blurred, is the page's backdrop under a night scrim, so every event wears its own colour. On it,
// the poster card (the cover, the mode, the date chip) beside what, when, where, who, the going count and
// the join box, anchored at #rsvp. Below: About, Where with the map, and the event chat (a visitor sees it
// and the first tap asks them to join), with the host and the Frequency note down the side.
//
// Everything it shows is handed in by app/(public)/events/[slug]/page.tsx, which owns every read and every
// privacy rule (the venue line, the map point only for a visible address, the hidden-address note). This
// file only places it. The page sits outside the member shell, so it opens its own kit scope.

export function FqPublicEventBody({
  structuredData,
  heroUrl,
  heroFocus,
  modeLabel,
  kicker,
  title,
  status,
  dateChip,
  whenLine,
  where,
  going,
  joinHeading,
  joinBox,
  joinHref,
  about,
  whereNote,
  venuePoint,
  host,
}: {
  structuredData: ReactNode
  heroUrl: string | null
  heroFocus: string | null
  /** In person, Online or Hybrid, on the photo. */
  modeLabel: string
  /** "Circle · Gathering": who puts it on and what it is. */
  kicker: string
  title: string
  /** "This event has ended" and similar, under the title. */
  status: ReactNode
  /** The calendar chip on the poster: "OCT" over "14". */
  dateChip: { month: string; day: number }
  whenLine: string
  where: ReactNode
  /** Confirmed going seats, or null when the count could not be read. */
  going: number | null
  joinHeading: string
  joinBox: ReactNode
  /** Where "Join free" goes from the chat prompt. */
  joinHref: string
  about: string
  /** The hidden-venue note, or null when the exact place is already on the page. */
  whereNote: ReactNode
  /** The venue's point, only when the host left the address visible. */
  venuePoint: { lat: number; lng: number } | null
  host: { name: string; href: string } | null
}) {
  const cover = heroUrl
    ? { backgroundImage: `url('${heroUrl}')`, ...(heroFocus ? { backgroundPosition: heroFocus } : {}) }
    : undefined
  return (
    <div data-kit="members" className="fqm-public fqm-pe">
      {structuredData}
      <div className="fqm-pe-backdrop" style={cover} aria-hidden />
      <div className="wrap fqm-pe-wrap">
        <Link className="meta fqm-back" href="/discover/events">
          ← Back to Events
        </Link>

        <section className="fqm-pe-hero">
          <div className="ph fqm-pe-poster fq-iri-rim" style={cover}>
            <span className="tag glass">{modeLabel}</span>
            <span className="fqm-pe-date" aria-hidden>
              <small>{dateChip.month}</small>
              <b>{dateChip.day}</b>
            </span>
          </div>

          <div className="fqm-pe-info">
            <span className="k">{kicker}</span>
            {/* header-ok: the hero IS this page's header (the Event.html reference), so it owns the h1. */}
            <h1 className="h1">{title}</h1>
            {status}
            <ul className="fqm-pe-facts">
              <li>
                <FqIcon name="clock" />
                <span>{whenLine}</span>
              </li>
              <li>
                <FqIcon name="pin" />
                <span>{where}</span>
              </li>
              {host && (
                <li>
                  <FqIcon name="event" />
                  <span>
                    Hosted by <Link href={host.href}>{host.name}</Link>
                  </span>
                </li>
              )}
            </ul>
            {going != null && going > 0 && (
              <div className="fqm-pe-going">
                <span className="fqm-pe-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <b>{going}</b> {going === 1 ? 'person is' : 'people are'} going
                </span>
              </div>
            )}
            <div className="panel stack fqm-pe-join" id="rsvp">
              <span className="h3">{joinHeading}</span>
              {joinBox}
            </div>
          </div>
        </section>

        <div className="ap-cols sec">
          <div className="stack fqm-secs">
            <section className="panel stack">
              <h2 className="h2">About</h2>
              <p className="body fqm-pre">{about}</p>
            </section>
            <section className="panel stack">
              <h2 className="h2">Where</h2>
              <span className="body">{where}</span>
              {whereNote && <span className="t2">{whereNote}</span>}
              <FqEventMap mapPin={null} venuePoint={venuePoint} />
            </section>
            <PublicEventChat title={title} joinHref={joinHref} going={going} />
          </div>

          <aside className="side">
            {host && (
              <div className="panel stack">
                <span className="k">Host</span>
                <Link className="t1" href={host.href}>
                  {host.name}
                </Link>
                <span className="t2">Meet the regulars before you go.</span>
              </div>
            )}
            <div className="panel stack">
              <span className="k">New to Frequency?</span>
              <span className="t2">
                Frequency is where people near you meet in person, again and again. RSVP as a guest, and the
                confirmation email has a link to make your account. Your RSVP or ticket comes with you.
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
