// FH-031: completing a Hunt never grants admission. The finale is open only to a finished player who
// holds a seat at the host Event, as the Events tables say: full Event, absent ticket, wrong Event and
// refunded ticket each refuse, and the module can write nothing to an Events table.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  finaleDoorEvidence,
  finaleRefusalMessage,
  grantFinaleReward,
  parseFinale,
  projectFinale,
  type FinaleFacts,
  type FinaleRsvp,
  type FinaleTicket,
  type HostEvent,
} from './rally-finale'

const EVENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const event = (over: Partial<HostEvent> = {}): HostEvent => ({ id: EVENT, title: 'Rally night', slug: 'rally-night', startsAt: '2026-12-01T03:00:00Z', capacity: 40, cancelled: false, published: true, hostSpaceId: 'home', ...over })
const ticket = (over: Partial<FinaleTicket> = {}): FinaleTicket => ({ id: 't1', eventId: EVENT, status: 'succeeded', refundedAt: null, attendedAt: null, ...over })
const rsvp = (over: Partial<FinaleRsvp> = {}): FinaleRsvp => ({ id: 'r1', eventId: EVENT, status: 'going', approvalStatus: 'none', attendedAt: null, ...over })
const facts = (over: Partial<FinaleFacts> = {}): FinaleFacts => ({
  finale: { eventId: EVENT },
  event: event(),
  going: 12,
  rsvps: [],
  tickets: [],
  selfCheckedIn: false,
  runState: 'completed',
  huntOwnerSpaceId: 'home',
  livePartnerSpaceIds: [],
  ...over,
})
const access = (over: Partial<FinaleFacts> = {}) => {
  const p = projectFinale(facts(over))
  return p.kind === 'none' ? null : p.access
}

describe('parseFinale', () => {
  it('reads the host Event from the published policy and nothing else', () => {
    expect(parseFinale({ finale: { event_id: EVENT } })).toEqual({ eventId: EVENT })
    expect(parseFinale({ finale: { event_id: 'rally-night' } })).toBeNull()
    expect(parseFinale({ finale: null })).toBeNull()
    expect(parseFinale({})).toBeNull()
    expect(parseFinale(null)).toBeNull()
  })
})

describe('finishing a Hunt never grants admission', () => {
  it('opens the finale to a finished player with a paid ticket or a going RSVP', () => {
    expect(access({ tickets: [ticket()] })).toEqual({ allowed: true, via: 'ticket' })
    expect(access({ rsvps: [rsvp()] })).toEqual({ allowed: true, via: 'rsvp' })
  })

  it('full Event: a finished player with no seat is refused, and the count is the Event’s', () => {
    const p = projectFinale(facts({ going: 40 }))
    expect(p).toMatchObject({ kind: 'finale', admission: 'none', capacity: { capacity: 40, going: 40, spotsLeft: 0, isFull: true }, access: { allowed: false, reason: 'event_full' } })
    expect(access({ going: 55 })).toEqual({ allowed: false, reason: 'event_full' })
  })

  it('full Event: a waitlist place is not a seat, however complete the Hunt is', () => {
    expect(access({ going: 40, rsvps: [rsvp({ status: 'waitlist' })] })).toEqual({ allowed: false, reason: 'waitlisted' })
  })

  it('full Event: a player who already holds a seat keeps it', () => {
    expect(access({ going: 40, tickets: [ticket()] })).toEqual({ allowed: true, via: 'ticket' })
  })

  it('absent ticket: no ticket and no RSVP is no seat, with room to spare', () => {
    expect(access()).toEqual({ allowed: false, reason: 'no_seat' })
    expect(access({ tickets: [ticket({ status: 'pending' })] })).toEqual({ allowed: false, reason: 'no_seat' })
    expect(access({ tickets: [ticket({ status: 'failed' })] })).toEqual({ allowed: false, reason: 'no_seat' })
    expect(access({ rsvps: [rsvp({ status: 'not_going' })] })).toEqual({ allowed: false, reason: 'no_seat' })
  })

  it('a request the host has not answered is not a seat, even though its status reads going', () => {
    expect(access({ rsvps: [rsvp({ status: 'going', approvalStatus: 'pending' })] })).toEqual({ allowed: false, reason: 'awaiting_host' })
  })

  it('wrong Event: a ticket or RSVP for another Event does not count', () => {
    expect(access({ tickets: [ticket({ eventId: OTHER })], rsvps: [rsvp({ eventId: OTHER })] })).toEqual({ allowed: false, reason: 'no_seat' })
    const p = projectFinale(facts({ tickets: [ticket({ eventId: OTHER, attendedAt: '2026-12-01T04:00:00Z' })] }))
    expect(p).toMatchObject({ admission: 'none', attendance: 'none', seat: null })
  })

  it('wrong Event: the loaded Event must be the one the version names', () => {
    expect(access({ event: event({ id: OTHER }), tickets: [ticket({ eventId: OTHER })] })).toEqual({ allowed: false, reason: 'event_unavailable' })
  })

  it('refunded ticket: not a seat, whichever way the row says so', () => {
    expect(access({ tickets: [ticket({ status: 'refunded', refundedAt: '2026-11-20T00:00:00Z' })] })).toEqual({ allowed: false, reason: 'ticket_refunded' })
    expect(access({ tickets: [ticket({ status: 'succeeded', refundedAt: '2026-11-20T00:00:00Z' })] })).toEqual({ allowed: false, reason: 'ticket_refunded' })
    expect(access({ tickets: [ticket({ status: 'refunded' })] })).toEqual({ allowed: false, reason: 'ticket_refunded' })
  })

  it('refunded ticket: a second, paid ticket still admits', () => {
    expect(access({ tickets: [ticket({ id: 't0', status: 'refunded', refundedAt: '2026-11-20T00:00:00Z' }), ticket()] })).toEqual({ allowed: true, via: 'ticket' })
  })

  it('a seat alone is not the finale: the Hunt must be complete too', () => {
    expect(access({ runState: 'active', tickets: [ticket()] })).toEqual({ allowed: false, reason: 'hunt_not_complete' })
  })

  it('a cancelled, unpublished or missing Event has no finale', () => {
    for (const e of [event({ cancelled: true }), event({ published: false }), null]) {
      expect(access({ event: e, tickets: [ticket()] })).toEqual({ allowed: false, reason: 'event_unavailable' })
    }
  })

  it('a Space Hunt ends only at its own Space’s Event or a live partner’s', () => {
    expect(access({ event: event({ hostSpaceId: 'venue' }), tickets: [ticket()] })).toEqual({ allowed: false, reason: 'event_unavailable' })
    expect(access({ event: event({ hostSpaceId: 'venue' }), livePartnerSpaceIds: ['venue'], tickets: [ticket()] })).toEqual({ allowed: true, via: 'ticket' })
    expect(access({ huntOwnerSpaceId: null, event: event({ hostSpaceId: null }), tickets: [ticket()] })).toEqual({ allowed: true, via: 'ticket' })
  })

  it('a Hunt with no finale projects nothing', () => {
    expect(projectFinale(facts({ finale: null }))).toEqual({ kind: 'none' })
  })

  it('has a line for every refusal, and none of them promises a seat', () => {
    for (const reason of ['hunt_not_complete', 'event_unavailable', 'event_full', 'waitlisted', 'awaiting_host', 'ticket_refunded', 'no_seat'] as const) {
      expect(finaleRefusalMessage(reason).length).toBeGreaterThan(10)
      expect(finaleRefusalMessage(reason)).not.toContain('—')
    }
    expect(finaleRefusalMessage('event_full')).toContain('does not hold a place')
  })
})

describe('attendance evidence at the correct Event', () => {
  it('is door evidence only when the host marked the admitting seat', () => {
    const marked = projectFinale(facts({ tickets: [ticket({ attendedAt: '2026-12-01T04:00:00Z' })] }))
    expect(finaleDoorEvidence(marked)).toEqual({ evidenceId: `event-door:${EVENT}:ticket:t1`, assurance: 'event_door' })
    const rsvpMarked = projectFinale(facts({ rsvps: [rsvp({ attendedAt: '2026-12-01T04:00:00Z' })] }))
    expect(finaleDoorEvidence(rsvpMarked)?.evidenceId).toBe(`event-door:${EVENT}:rsvp:r1`)
  })

  it('records a self check-in but does not treat it as door evidence', () => {
    const p = projectFinale(facts({ tickets: [ticket()], selfCheckedIn: true }))
    expect(p).toMatchObject({ attendance: 'self_checked_in' })
    expect(finaleDoorEvidence(p)).toBeNull()
  })

  it('gives no evidence without a seat, for a refunded ticket, or at another Event', () => {
    expect(finaleDoorEvidence(projectFinale(facts({ selfCheckedIn: true })))).toBeNull()
    expect(finaleDoorEvidence(projectFinale(facts({ tickets: [ticket({ status: 'refunded', refundedAt: '2026-11-20T00:00:00Z', attendedAt: '2026-12-01T04:00:00Z' })] })))).toBeNull()
    expect(finaleDoorEvidence(projectFinale(facts({ tickets: [ticket({ eventId: OTHER, attendedAt: '2026-12-01T04:00:00Z' })] })))).toBeNull()
    expect(finaleDoorEvidence(projectFinale(facts({ finale: null })))).toBeNull()
  })
})

describe('the completion award', () => {
  const input = { actorId: 'a', runId: 'r', rewardKey: 'finale-pin', idempotencyKey: 'key-0000001' }
  const granting = () => vi.fn().mockResolvedValue({ data: { result: 'granted', grant_id: 'g1' }, error: null })

  it('is never asked of the database when the Event does not admit the player', async () => {
    for (const over of [{ going: 40 }, {}, { tickets: [ticket({ eventId: OTHER })] }, { tickets: [ticket({ status: 'refunded', refundedAt: '2026-11-20T00:00:00Z' })] }] as Partial<FinaleFacts>[]) {
      const rpc = granting()
      const out = await grantFinaleReward(rpc, input, projectFinale(facts(over)))
      expect(out.result).toBe('not_admitted')
      expect(rpc).not.toHaveBeenCalled()
    }
  })

  it('is granted to an admitted, finished player, and to any finisher when there is no finale', async () => {
    const rpc = granting()
    expect((await grantFinaleReward(rpc, input, projectFinale(facts({ tickets: [ticket()] })))).result).toBe('granted')
    expect((await grantFinaleReward(rpc, input, projectFinale(facts({ finale: null })))).result).toBe('granted')
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})

describe('the Hunt only reads admission', () => {
  it('has no write to an Events table anywhere in the finale code', () => {
    for (const file of ['lib/hunts/rally-finale.ts', 'lib/hunts/rally-finale-store.ts']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8')
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/)
      expect(src).not.toMatch(/\.rpc\(/)
    }
  })
})
