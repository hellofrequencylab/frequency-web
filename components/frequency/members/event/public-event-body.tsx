import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/active/kit-members'
import '@/app/themes/active/members-b'

// THE PUBLIC EVENT PAGE, FREQUENCY BODY (templates/members/Event.html), for the signed-out share URL
// /events/<slug>. The member page draws the same reference through FqEventBody; this twin exists
// because that body's panels read the request (the cookie client), and this page is ISR: one cookie
// read here would turn every shared event link into a per-request render (lib/nav/public-detail-isr).
//
// Same anatomy as the reference: the split hero card (photo, then what, when, where, who and the
// join box), then About and Where down the main column and the Host down the side. Everything it
// shows is handed in by app/(public)/events/[slug]/page.tsx, which owns every read and every privacy
// rule (the venue line, the hidden-address note). This file only places it.
//
// The page sits outside the member shell, so it opens its own kit scope inside the site's `.wrap`
// container, the same way the public Space page does (space-chrome.tsx).

export function FqPublicEventBody({
  structuredData,
  heroUrl,
  heroFocus,
  modeLabel,
  kicker,
  title,
  status,
  whenLine,
  where,
  going,
  joinHeading,
  joinBox,
  about,
  whereNote,
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
  whenLine: string
  where: ReactNode
  /** Confirmed going seats, or null when the count could not be read. */
  going: number | null
  joinHeading: string
  joinBox: ReactNode
  about: string
  /** The hidden-venue note, or null when the exact place is already on the page. */
  whereNote: ReactNode
  host: { name: string; href: string } | null
}) {
  return (
    <div className="wrap">
      <div data-kit="members" className="fqm-public">
        {structuredData}
        <Link className="meta fqm-back" href="/discover/events">
          ← Back to Events
        </Link>

        <section className="card fqm-ev">
          <div
            className="ph fqm-ev-ph"
            style={
              heroUrl
                ? { backgroundImage: `url('${heroUrl}')`, ...(heroFocus ? { backgroundPosition: heroFocus } : {}) }
                : undefined
            }
          >
            <span className="tag glass">{modeLabel}</span>
          </div>
          <div className="fqm-ev-in">
            <span className="k">{kicker}</span>
            {/* header-ok: the hero card IS this page's header (the Event.html reference), so it owns the h1. */}
            <h1 className="h1">{title}</h1>
            {status}
            <span className="body">
              {whenLine}
              <br />
              {where}
            </span>
            {host && (
              <span className="t2">
                Hosted by <Link href={host.href}>{host.name}</Link>
              </span>
            )}
            {going != null && going > 0 && <span className="t2">{going} going</span>}
            <div className="fqm-ev-act">
              <span className="h3">{joinHeading}</span>
              {joinBox}
            </div>
          </div>
        </section>

        <div className="ap-cols sec">
          <div className="stack fqm-secs">
            <div className="stack">
              <h2 className="h2">About</h2>
              <p className="body fqm-pre">{about}</p>
            </div>
            <div className="stack">
              <h2 className="h2">Where</h2>
              <span className="body">{where}</span>
              {whereNote && <span className="t2">{whereNote}</span>}
            </div>
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
