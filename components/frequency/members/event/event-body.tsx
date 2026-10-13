import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/frequency/members-b.css'
import { FqIcon } from '@/components/frequency/icon'
import { FqModules } from '@/components/frequency/members/modules'
import { FqCopyLink } from '@/components/frequency/members/shared/copy-link'
import { FqEventCalendar, FqEventHost, FqEventPlan, FqEventWhere } from './event-panels'

// EVENT, FREQUENCY BODY (templates/members/Event.html). The page (event-member-page.tsx) keeps every
// read, gate and derivation it already had and hands this body the results: the JOIN BOX it built
// (RSVP, tickets, waitlist, guest forms, payment flow: one node, unchanged), the check-in surface,
// the share / manage / edit controls and the claim doors. This file only decides where each one sits
// in the reference layout: the split hero card, About / Plan / Where down the main column, Host and
// Going down the side.
//
// The reference's own sections are drawn in the kit by event-panels.tsx (Plan, Good to know, Links,
// Where with its map, the Host panel with Message, Add to calendar), each reading the event context
// the page stamped. The blocks that carry their own tools (activity and its composer, the recap
// album, the host's co host controls, a manager's inline description editor) still render through
// <FqModules>, so none of them is re-derived here.

export type FqGoingPerson = { id: string; name: string; handle: string; avatarUrl: string | null }

export function FqEventBody({
  structuredData,
  notices,
  bodyLead,
  heroUrl,
  modeLabel,
  kicker,
  title,
  whenLine,
  where,
  cadence,
  hostedBy,
  postedBy,
  going,
  goingPeople,
  namesVisible,
  fromYourCircles,
  checkInZaps,
  joinBox,
  checkIn,
  controls,
  description,
  canManage,
  seriesRail,
  belonging,
}: {
  structuredData: ReactNode
  notices: ReactNode
  bodyLead: ReactNode
  heroUrl: string | null
  modeLabel: string
  /** "Host · In person": who puts it on and how you attend. */
  kicker: string
  /** The h1 content (the inline title editor for a manager). */
  title: ReactNode
  whenLine: string
  where: ReactNode
  cadence: string | null
  hostedBy: ReactNode
  /** The member who posted a gathering a host then took over (the one byline the owner kept). */
  postedBy: ReactNode
  /** Every going seat, members and guests (the headcount the join box also prints). */
  going: number
  /** The going members with a profile, in RSVP order. */
  goingPeople: FqGoingPerson[]
  /** Crew see who is going by name; everyone else sees faces and a count (the DAWN fact panel's
   *  `guestsAreVisible` rule, unchanged). */
  namesVisible: boolean
  fromYourCircles: number
  /** Zaps paid at the door, or null when the host has check-in off. */
  checkInZaps: number | null
  joinBox: ReactNode
  checkIn: ReactNode
  controls: ReactNode
  description: string | null
  canManage: boolean
  seriesRail: ReactNode
  belonging: ReactNode
}) {
  const faces = goingPeople.slice(0, 3)
  const named = namesVisible ? goingPeople.slice(0, 2).map((p) => p.name.split(' ')[0]) : []
  const others = Math.max(0, going - named.length)
  const goingLine =
    going === 0
      ? null
      : named.length === 0
        ? `${going} going`
        : others > 0
          ? `${named.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'} going`
          : `${named.join(' and ')} going`

  return (
    <>
      {structuredData}
      <Link className="meta fqm-back" href="/events">
        ← Back to Events
      </Link>

      <div className="fqm-notices">{notices}</div>
      {bodyLead}

      <section className="card fqm-ev">
        <div className="ph fqm-ev-ph" style={heroUrl ? { backgroundImage: `url('${heroUrl}')` } : undefined}>
          <span className="tag glass">{modeLabel}</span>
        </div>
        <div className="fqm-ev-in">
          <span className="k">{kicker}</span>
          <h1 className="h1">{title}</h1>
          <span className="body">
            {whenLine}
            {where && (
              <>
                <br />
                {where}
              </>
            )}
            {cadence && (
              <>
                <br />
                {cadence}
              </>
            )}
          </span>
          {hostedBy && <span className="t2">{hostedBy}</span>}
          {postedBy && <span className="t2">{postedBy}</span>}
          {goingLine && (
            <div className="row">
              {faces.length > 0 && (
                <span className="faces">
                  {faces.map((p) => (
                    <span
                      key={p.id}
                      className="av s"
                      style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')` } : undefined}
                    />
                  ))}
                </span>
              )}
              <span className="t2">{goingLine}</span>
            </div>
          )}
          {checkInZaps != null && (
            <span className="tag fqm-tag-start">
              <FqIcon name="zap" /> {checkInZaps} at the door
            </span>
          )}
          {fromYourCircles > 0 && (
            <span className="why">
              Because {fromYourCircles} {fromYourCircles === 1 ? 'person' : 'people'} from your Circles{' '}
              {fromYourCircles === 1 ? 'is' : 'are'} going.
            </span>
          )}
          {checkIn}
          <div className="fqm-ev-act">
            {joinBox}
            <div className="row wrap">{controls}</div>
          </div>
        </div>
      </section>

      {seriesRail}

      <div className="ap-cols sec">
        <div className="stack fqm-secs">
          {canManage ? (
            <FqModules ids={['event-description']} />
          ) : (
            description && (
              <div className="stack">
                <span className="h2">About</span>
                <p className="body">{description}</p>
              </div>
            )
          )}
          <FqEventPlan />
          <FqEventWhere />
          <FqModules ids={['event-activity', 'event-recap']} />
        </div>

        <aside className="side">
          <FqEventHost />
          <div className="panel stack">
            <span className="k">Going · {going}</span>
            {namesVisible && goingPeople.length > 0 ? (
              <div className="list">
                {goingPeople.slice(0, 8).map((p) => (
                  <Link key={p.id} href={`/people/${p.handle}`}>
                    <span
                      className="av s"
                      style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')` } : undefined}
                    />
                    <span className="t1 grow">{p.name}</span>
                  </Link>
                ))}
              </div>
            ) : faces.length > 0 ? (
              <span className="faces">
                {goingPeople.slice(0, 6).map((p) => (
                  <span
                    key={p.id}
                    className="av s"
                    style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')` } : undefined}
                  />
                ))}
              </span>
            ) : (
              <span className="t2">Nobody yet. Be the first.</span>
            )}
            {namesVisible && goingPeople.length > 8 && <span className="t2">and {goingPeople.length - 8} more</span>}
            <FqCopyLink label="Bring a friend" className="btn sm fqm-tag-start" />
          </div>
          <FqEventCalendar />
          <FqModules ids={['event-cohosts']} />
          {belonging}
        </aside>
      </div>
    </>
  )
}
