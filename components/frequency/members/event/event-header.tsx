import Image from 'next/image'
import type { CSSProperties, ReactNode } from 'react'
import '@/app/themes/active/members-b'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'

// THE EVENT HEADER, FREQUENCY PIECES (SCAN-903). The member event page keeps the original
// EventDetailTemplate layout under Frequency (FQ_EVENT_KIT_LAYOUT is off by owner ruling, 2026-10-14),
// so these are not a second layout: they are the nodes the page hands that template's slots when the
// design is Frequency. The cover, one fact row, and the action row. DAWN never renders this file.
//
// Owner, 2026-10-14: "I feel like we can do better on the event listing header and title area." The
// flyer was cropped through its own lettering, the title was oversized with the buttons floating
// beside it, and the facts were loose lines. Each piece below answers one of those.

/**
 * THE COVER, SHOWN WHOLE. A flyer carries its own type, so cropping it to a band cut the words off.
 * The artwork now sits `object-fit: contain` over a blurred, scaled copy of itself: the frame is
 * always filled, and nothing of the poster is ever lost. The host's focus point still decides where
 * the slack goes when the frame is wider (or taller) than the art. With the cover's measured shape
 * the frame takes that shape up to the height cap, so a cover that fits has no backdrop at all.
 */
export function FqEventCover({
  src,
  alt,
  focus,
  aspect,
  unoptimized,
  dateDay,
  dateMonth,
}: {
  src: string | null
  alt: string
  focus: string | null
  /** width / height when the cover was measured (ADR-1248), else null. */
  aspect: number | null
  unoptimized: boolean
  /** The no-cover placeholder leads with the date, like the DAWN one. */
  dateDay: string
  dateMonth: string
}) {
  if (!src) {
    return (
      <div className="fqm-evh-cover is-empty">
        <span className="fqm-evh-cover-date">
          <b>{dateDay}</b>
          <i>{dateMonth}</i>
        </span>
      </div>
    )
  }
  const shaped = typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0
  const style = shaped ? ({ aspectRatio: String(aspect) } as CSSProperties) : undefined
  const position = focus ?? undefined
  return (
    <div className={shaped ? 'fqm-evh-cover is-shaped' : 'fqm-evh-cover'} style={style}>
      {/* The backdrop: the same image, blurred and scaled, so a frame wider than the art reads as
          the art's own light rather than a grey bar. Same `sizes` as the poster, so one download. */}
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes="(max-width: 1024px) 100vw, 1344px"
        className="fqm-evh-cover-bg"
        style={{ objectPosition: position }}
        unoptimized={unoptimized}
      />
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 1344px"
        className="fqm-evh-cover-art"
        style={{ objectPosition: position }}
        preload
        unoptimized={unoptimized}
      />
    </div>
  )
}

/** One line of the facts list: an icon tile, the fact, an optional quieter second line and an
 *  optional trailing action (Directions). */
export function FqEventFact({
  icon,
  children,
  sub,
  action,
}: {
  icon: FqIconName
  children: ReactNode
  sub?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="fqm-evh-fact">
      <span className="fqm-evh-fact-ic">
        <FqIcon name={icon} />
      </span>
      {/* Divs, not spans: the host line arrives as a <p> (the DAWN line's own markup). */}
      <div className="fqm-evh-fact-b">
        <div className="t1">{children}</div>
        {sub && <div className="t2">{sub}</div>}
        {action}
      </div>
    </div>
  )
}

/** What the header's primary action says for this viewer. The control itself is the Join box in the
 *  body (RSVP, tickets, waitlist, guest forms): this is the one-tap way to it, so it never decides
 *  anything the box does not. Null when there is nothing to do (cancelled, ended, sold out). */
export function fqEventPrimaryAction(input: {
  cancelled: boolean
  ended: boolean
  ticketsMode: boolean
  ownsTicket: boolean
  soldOut: boolean
  going: boolean
  waitlisted: boolean
  full: boolean
}): { label: string; icon: FqIconName; done: boolean } | null {
  if (input.cancelled || input.ended) return null
  if (input.ticketsMode) {
    if (input.ownsTicket) return { label: 'Your ticket', icon: 'ticket', done: true }
    if (input.soldOut) return null
    return { label: 'Get tickets', icon: 'ticket', done: false }
  }
  if (input.going || input.ownsTicket) return { label: "You're going", icon: 'check', done: true }
  if (input.waitlisted) return { label: 'On the waitlist', icon: 'clock', done: true }
  if (input.full) return { label: 'Join waitlist', icon: 'clock', done: false }
  return { label: 'RSVP', icon: 'event', done: false }
}

/** The id the Join box carries under Frequency, so the header's primary action can jump to it. */
export const FQ_EVENT_JOIN_ID = 'event-join'

/** THE ONE ACTION ROW: the RSVP / ticket action first, then Share, then the manager's tools. */
export function FqEventActionRow({
  primary,
  share,
  manage,
}: {
  primary: ReturnType<typeof fqEventPrimaryAction>
  share: ReactNode
  /** Manage and Edit, already rendered as quiet kit buttons. Null for a guest. */
  manage: ReactNode
}) {
  return (
    <div className="fqm-evh-act">
      {primary && (
        <a className={primary.done ? 'btn fqm-evh-done' : 'btn pa'} href={`#${FQ_EVENT_JOIN_ID}`}>
          <FqIcon name={primary.icon} />
          {primary.label}
        </a>
      )}
      {share}
      {manage && <span className="fqm-evh-tools">{manage}</span>}
    </div>
  )
}
