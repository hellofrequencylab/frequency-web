// THE DISCOVER PAGES' SHARED PIECES under the Frequency design (lane C: the /discover hub, What's happening,
// the city x type hubs, the host pages, cities and places). Written in the "site" kit's idiom (`.phero`,
// `.sec > .wrap`, `.sh > .label`, `.pc`, `.g3`, `.qa`, <KeepGoing/>) plus the few pieces the kit has no
// class for, which app/themes/frequency/site-discover.css draws on the --fq- tokens: the date-chip event
// card (templates/members/app/events.css `.ev-date`), the grouped calendar, the proof strip, town cards
// and link chips.
//
// Server components, no request data: every route that renders them keeps its ISR revalidate (LIVE-012).
// Privacy is the readers' contract and nothing here widens it: an event carries a CITY, never a venue
// (ADR-186, ADR-1743/1744), so a card says the town and the RSVP page says the rest.

import '@/app/themes/frequency/site-discover.css'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import type { PublicCircle, PublicEvent } from '@/lib/discover'
import type { NetworkedSpace } from '@/lib/spaces/discovery'
import { eventDateBadge } from '@/lib/utils'
import { FOUNDING_PLACE, SOCIAL_PROOF_FLOOR } from '@/lib/site'
import { eventWhen } from '../shared/data'
import { groupByMonth, groupByWhen, splitAt, type EventGroup } from './group'

export const PHOTOS = '/brand/frequency/photos'
export const dxPhoto = (name: string) => `${PHOTOS}/${name}`
const aura = (opacity: number) => ({ '--fq-aura-opacity': opacity }) as CSSProperties

export interface Crumb {
  href?: string
  label: string
}

/** The page hero: the kit's `.phero` (photo, aura, shade) with the breadcrumb trail the design's inner
 *  pages open on. The trail mirrors the BreadcrumbList JSON-LD each route already publishes. */
export function DxHero({
  crumbs,
  photo,
  title,
  lede,
  energy = 'flow',
  badge,
  children,
}: {
  crumbs: Crumb[]
  photo: string
  /** Drawn above the title (a host's avatar). */
  badge?: ReactNode
  title: ReactNode
  lede: ReactNode
  energy?: 'still' | 'flow' | 'charge'
  children?: ReactNode
}) {
  return (
    <section className="phero" data-energy={energy} data-screen-label="01 Hero">
      <div className="bg" style={{ backgroundImage: `url('${photo}')` }} />
      <div className="fq-aura" style={aura(0.3)} />
      <div className="shade" />
      <div className="fq-grain" />
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="dx-crumb">
              <span aria-hidden="true">/</span>
              {c.href && i < crumbs.length - 1 ? (
                <Link href={c.href}>{c.label}</Link>
              ) : (
                <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {badge}
        <h1 className="h-xl">{title}</h1>
        <p>{lede}</p>
        {children}
      </div>
    </section>
  )
}

/** A section heading in the kit's form: the label line (bold first word, quiet second) over an `.h-l`. */
export function DxHead({ label, sub, title, lede }: { label: string; sub?: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="sh">
      <div className="label">
        <b>{label}</b>
        {sub}
      </div>
      <h2 className="h-l">{title}</h2>
      {lede && <p className="body-l dx-lede">{lede}</p>}
    </div>
  )
}

/** One event as the design's date-chip card: the month and day in a chip, the title, the weekday and time
 *  in the event's own wall clock, the town (never the venue), and an honest price pill. */
export function DxEventCard({ event, price = true }: { event: PublicEvent; price?: boolean }) {
  const badge = eventDateBadge(event.starts_at)
  const where = [event.circle_name, event.city].filter(Boolean).join(' · ')
  // `price_cents` null/0 is free on the public reads (lib/discover). A caller whose read does not carry
  // a price at all (the host page's RPC) passes price={false} so no pill makes a claim it cannot back.
  const paid = (event.price_cents ?? 0) > 0
  return (
    <Link className="dx-ev" href={`/events/${event.slug}`}>
      <span className="dx-date" aria-hidden="true">
        <i>{badge.month}</i>
        <b>{badge.day}</b>
      </span>
      <span className="dx-tx">
        <small>{eventWhen(event.starts_at)}</small>
        <b>{event.title}</b>
        {where && <em>{where}</em>}
      </span>
      {price && <span className={paid ? 'dx-tag paid' : 'dx-tag'}>{paid ? 'Tickets' : 'Free'}</span>}
    </Link>
  )
}

function Groups<T extends PublicEvent>({ groups, price }: { groups: EventGroup<T>[]; price: boolean }) {
  return (
    <>
      {groups.map((g) => (
        <div className="dx-grp" key={g.key}>
          <h3 className="dx-grp-h">
            {g.label}
            <span>
              {g.events.length} {g.events.length === 1 ? 'event' : 'events'}
            </span>
          </h3>
          <div className="dx-evs">
            {g.events.map((e) => (
              <DxEventCard key={e.id} event={e} price={price} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/** "What's happening": the calendar in buckets (this week, next week, then by month), the first `limit`
 *  cards open and the rest folded behind a native disclosure. Every event stays in the HTML. */
export function DxCalendar({
  events,
  today,
  limit = 12,
  price = true,
  past = false,
  empty,
}: {
  events: PublicEvent[]
  today: string
  limit?: number
  price?: boolean
  /** Past events: bucket by month instead of this week / next week. */
  past?: boolean
  empty: ReactNode
}) {
  if (events.length === 0) return empty ? <div className="dx-note">{empty}</div> : null
  const grouped = past ? groupByMonth(events, today) : groupByWhen(events, today)
  const { shown, folded, foldedCount } = splitAt(grouped, limit)
  return (
    <div className="dx-cal">
      <Groups groups={shown} price={price} />
      {foldedCount > 0 && (
        <details className="dx-more">
          <summary>
            Show {foldedCount} more {foldedCount === 1 ? 'event' : 'events'}
          </summary>
          <div className="dx-cal">
            <Groups groups={folded} price={price} />
          </div>
        </details>
      )}
    </div>
  )
}

/** The live proof strip. Above SOCIAL_PROOF_FLOOR it prints the real reads; below it, the founding line,
 *  because a new community showing "3 members" argues against itself (STUDIO-REVIEW P0). Never invented. */
export function DxProof({ members, circles, events }: { members: number; circles: number; events: number }) {
  if (members < SOCIAL_PROOF_FLOOR) {
    return (
      <div className="dx-proof">
        <p>
          The first Circles are taking root in <b>{FOUNDING_PLACE}</b>. The founding members are shaping what this
          becomes. Come be one of them.
        </p>
      </div>
    )
  }
  return (
    <div className="dx-proof">
      <span className="dx-proof-k">Already happening in {FOUNDING_PLACE}</span>
      <dl>
        <DxStat value={members} label="members" />
        <DxStat value={circles} label={circles === 1 ? 'Circle' : 'Circles'} />
        <DxStat value={events} label={events === 1 ? 'upcoming event' : 'upcoming events'} />
      </dl>
    </div>
  )
}

/** One figure: the label first in the markup (a `dl` group is dt then dd), the number drawn above it. */
export function DxStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="dx-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** The conversion card under a list: one line of why, one button. */
export function DxAsk({ title, body, href, label }: { title: string; body: string; href: string; label: string }) {
  return (
    <div className="dx-ask">
      <div>
        <b>{title}</b>
        <p>{body}</p>
      </div>
      <Link className="btn fq-iri-btn" href={href}>
        {label}
      </Link>
    </div>
  )
}

/** A quiet empty-state panel. */
export function DxNote({ children }: { children: ReactNode }) {
  return <div className="dx-note">{children}</div>
}

/** A row of link chips (event types in a town, the other ways to browse). */
export function DxChips({ items, label }: { items: { href: string; label: string; count?: number }[]; label: string }) {
  if (items.length === 0) return null
  return (
    <nav className="dx-chips" aria-label={label}>
      {items.map((c) => (
        <Link key={c.href} href={c.href}>
          {c.label}
          {typeof c.count === 'number' && <i>{c.count}</i>}
        </Link>
      ))}
    </nav>
  )
}

/** Circles as the kit's `.pc` cards: name, a line about it, members, town and Channel. */
export function DxCircleCards({ circles }: { circles: PublicCircle[] }) {
  return (
    <div className="g3 dx-cards">
      {circles.map((c) => (
        <Link key={c.id} className="pc dx-card" href={`/circles/${c.slug}`}>
          <span className="row">
            <span className="ic" aria-hidden="true">
              <FqIcon name="circle" />
            </span>
            {c.status === 'forming' && <span className="dx-tag">Forming</span>}
          </span>
          <h3>{c.name}</h3>
          {c.about && <p className="dx-clamp">{c.about}</p>}
          <span className="dx-meta">
            <span>
              {c.member_count} {c.member_count === 1 ? 'member' : 'members'}
            </span>
            {c.city && <span>{c.city}</span>}
            {c.channel_name && <span>{c.channel_name}</span>}
          </span>
        </Link>
      ))}
    </div>
  )
}

/** Networked Spaces as `.pc` cards. City-level only: the directory row carries no street. */
export function DxSpaceCards({ spaces }: { spaces: NetworkedSpace[] }) {
  return (
    <div className="g3 dx-cards">
      {spaces.map((s) => (
        <Link key={s.id} className="pc dx-card" href={`/spaces/${s.slug}`}>
          <span className="row">
            <span className="ic" aria-hidden="true">
              <FqIcon name="space" />
            </span>
            <span className="dx-tag">{s.kindLabel}</span>
          </span>
          <h3>{s.name}</h3>
          {s.tagline && <p className="dx-clamp">{s.tagline}</p>}
          {s.city && (
            <span className="dx-meta">
              <span>{s.city}</span>
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}

/** Towns as link cards with their two live counts. */
export function DxTowns({ towns, base }: { towns: { city: string; slug: string; circles?: number; events?: number }[]; base: string }) {
  return (
    <ul className="dx-towns">
      {towns.map((t) => (
        <li key={t.slug}>
          <Link className="dx-town" href={`${base}/${t.slug}`}>
            <span className="ic" aria-hidden="true">
              <FqIcon name="pin" />
            </span>
            <span className="dx-tx">
              <b>{t.city}</b>
              <TownCounts circles={t.circles} events={t.events} />
            </span>
            <span className="ar" aria-hidden="true">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function TownCounts({ circles, events }: { circles?: number; events?: number }) {
  const bits: string[] = []
  if (circles) bits.push(`${circles} ${circles === 1 ? 'Circle' : 'Circles'}`)
  if (events) bits.push(`${events} upcoming ${events === 1 ? 'event' : 'events'}`)
  return bits.length > 0 ? <em>{bits.join(' · ')}</em> : null
}

/** A two-column chapter: words on one side, a photo with the iridescent rim on the other. The kit's `.chap`
 *  gives the photo its 5:4 crop (16:10 under 860px); `.split` stacks the columns on a phone. */
export function DxChapter({
  label,
  sub,
  title,
  photo,
  alt,
  rev,
  children,
}: {
  label: string
  sub?: string
  title: ReactNode
  photo: string
  alt: string
  rev?: boolean
  children: ReactNode
}) {
  return (
    <section className="dx-sec chap" data-screen-label={label}>
      <div className={rev ? 'wrap split rev' : 'wrap split'}>
        <div>
          <div className="label">
            <b>{label}</b>
            {sub}
          </div>
          <h2 className="h-l dx-chap-h">{title}</h2>
          {children}
        </div>
        <div className="photo fq-iri-rim">
          {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img itself (object-fit cover) */}
          <img loading="lazy" decoding="async" src={photo} alt={alt} />
        </div>
      </div>
    </section>
  )
}
