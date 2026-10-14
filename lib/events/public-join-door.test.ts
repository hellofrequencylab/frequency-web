import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { resolvePublicJoinDoor, type DoorTier, type JoinDoorInput } from './public-join-door'

// The signed-out join door on the public event page. Before this, a stranger who opened a shared
// event link was sent to "Find your Circle": the guest RSVP and guest ticket forms existed, but only
// on the member page, which a signed-out visitor never reaches.

const base: JoinDoorInput = {
  isCancelled: false,
  hasEnded: false,
  inGuestGrace: false,
  joinMode: 'auto',
  flatPriceCents: 0,
  tiers: [],
  paymentsReady: false,
  rsvpWindowLine: null,
  isFull: false,
}

const tier = (over: Partial<DoorTier> = {}): DoorTier => ({
  id: 't1',
  name: 'General',
  description: null,
  pricingMode: 'fixed',
  priceCents: 2000,
  minCents: null,
  suggestedCents: null,
  soldOut: false,
  memberOnly: false,
  spaceMembersOnly: false,
  notYetOnSale: false,
  salesClosed: false,
  opensOnLabel: null,
  ...over,
})

describe('resolvePublicJoinDoor', () => {
  it('gives a free event the guest RSVP form, with no account asked for', () => {
    expect(resolvePublicJoinDoor(base)).toEqual({ kind: 'rsvp', isFull: false })
  })

  it('passes a full room through so the form offers the waitlist', () => {
    expect(resolvePublicJoinDoor({ ...base, isFull: true })).toEqual({ kind: 'rsvp', isFull: true })
  })

  it('gives a ticketed event the guest ticket form with the tiers a guest can buy', () => {
    const door = resolvePublicJoinDoor({
      ...base,
      paymentsReady: true,
      tiers: [tier(), tier({ id: 'm', memberOnly: true }), tier({ id: 'late', notYetOnSale: true })],
    })
    expect(door.kind).toBe('tickets')
    expect(door.kind === 'tickets' && door.tiers?.map((t) => t.id)).toEqual(['t1'])
  })

  it('sells a flat price with no tiers', () => {
    expect(resolvePublicJoinDoor({ ...base, flatPriceCents: 1500, paymentsReady: true })).toEqual({
      kind: 'tickets',
      priceLabel: '$15.00',
    })
  })

  it('never shows a buy form when the payee cannot be paid', () => {
    expect(resolvePublicJoinDoor({ ...base, flatPriceCents: 1500 }).kind).toBe('not_ready')
  })

  it('says sold out, and when a guest rate opens', () => {
    expect(resolvePublicJoinDoor({ ...base, paymentsReady: true, tiers: [tier({ soldOut: true })] })).toEqual({
      kind: 'tickets_closed',
      line: 'Sold out.',
    })
    expect(
      resolvePublicJoinDoor({
        ...base,
        paymentsReady: true,
        tiers: [tier({ notYetOnSale: true, opensOnLabel: 'Fri, Mar 6' })],
      }),
    ).toEqual({ kind: 'tickets_closed', line: 'Tickets go on sale Fri, Mar 6.' })
  })

  it('points to sign in only when members-only rates are all that is left', () => {
    expect(resolvePublicJoinDoor({ ...base, paymentsReady: true, tiers: [tier({ memberOnly: true })] }).kind).toBe(
      'sign_in',
    )
  })

  it('collects the seat and names the door price on a priced RSVP-mode event', () => {
    expect(resolvePublicJoinDoor({ ...base, joinMode: 'rsvp', flatPriceCents: 1000 })).toEqual({
      kind: 'rsvp',
      isFull: false,
      note: 'Pay the $10.00 at the door.',
    })
  })

  it('respects the host booking window', () => {
    expect(resolvePublicJoinDoor({ ...base, rsvpWindowLine: 'RSVPs for this one are closed.' })).toEqual({
      kind: 'rsvp_closed',
      line: 'RSVPs for this one are closed.',
    })
  })

  it('keeps the guest RSVP open in the grace after the end, and closes it after', () => {
    expect(resolvePublicJoinDoor({ ...base, hasEnded: true, inGuestGrace: true }).kind).toBe('rsvp')
    expect(resolvePublicJoinDoor({ ...base, hasEnded: true }).kind).toBe('ended')
  })

  it('closes ticket sales once the event is over, and says when it was cancelled', () => {
    expect(resolvePublicJoinDoor({ ...base, hasEnded: true, flatPriceCents: 500, paymentsReady: true }).kind).toBe(
      'tickets_closed',
    )
    expect(resolvePublicJoinDoor({ ...base, isCancelled: true }).kind).toBe('cancelled')
  })
})
