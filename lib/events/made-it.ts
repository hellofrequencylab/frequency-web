// "Did you make it?" (LIVE-803, ADR-1720). The invite loop's second half: the day after a
// gathering, everyone who said yes is asked whether they made it. The email carries the
// group's next date and a bring-a-friend link, and a Yes records attendance.
//
// WHAT A YES RECORDS. A self-reported attendance row in the engagement ledger: `event_attend`
// with `self_reported: true`, keyed `event_attend:<event>:<profile>` for a member (the same key
// the in-window check-in writes, so a member who already checked in is not counted twice) and
// `event_attend:<event>:<kind>:<id>` for a guest seat. It pays no Zaps and verifies nobody: the
// host's mark (attended_at / attended_by, ADR-1332) stays the north-star source (LIVE-809).
//
// THE LINK IS THE CREDENTIAL. A guest has no session, so the Yes link carries an HMAC over the
// seat it was minted for. A forged or swapped link records nothing.

import { createHmac, timingSafeEqual } from 'crypto'
import { signingSecret } from '@/lib/signing-secret'

export type SeatKind = 'rsvp' | 'ticket'

const getSecret = (): string => signingSecret('made-it', ['MADE_IT_SECRET', 'UNSUBSCRIBE_SECRET'])

export function makeMadeItToken(kind: SeatKind, seatId: string): string {
  return createHmac('sha256', getSecret()).update(`made-it:${kind}:${seatId}`).digest('hex').slice(0, 32)
}

export function verifyMadeItToken(kind: SeatKind, seatId: string, token: string): boolean {
  if (!token || token.length !== 32 || !/^[0-9a-f]+$/.test(token)) return false
  try {
    return timingSafeEqual(Buffer.from(makeMadeItToken(kind, seatId), 'hex'), Buffer.from(token, 'hex'))
  } catch {
    return false
  }
}

export function madeItUrl(appUrl: string, kind: SeatKind, seatId: string): string {
  return `${appUrl}/api/events/made-it?k=${kind}&s=${encodeURIComponent(seatId)}&t=${makeMadeItToken(kind, seatId)}`
}

/** The ledger key for a self-reported attendance. Members share the check-in's key. */
export function madeItKey(eventId: string, seat: { kind: SeatKind; id: string; profileId: string | null }): string {
  return seat.profileId
    ? `event_attend:${eventId}:${seat.profileId}`
    : `event_attend:${eventId}:${seat.kind}:${seat.id}`
}

/** The bring-a-friend link: the next gathering, tagged so first-touch attribution sees it. */
export function bringAFriendUrl(appUrl: string, slug: string): string {
  return `${appUrl}/events/${slug}?utm_source=bring-a-friend&utm_medium=email&utm_campaign=made-it`
}
