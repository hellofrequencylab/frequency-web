import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  guestSeatPath,
  guestSeatState,
  isSeatToken,
  loadGuestSeat,
  mintGuestSeatUrl,
  parseGuestSeat,
} from './guest-seat'

// PROG-GD2, the module beside the seat doors. What these pin:
//   1. the parser keeps exactly the fields the page may show, and a location, venue, street or
//      host key handed to it is DROPPED, so a hidden-address event can never leak through here;
//   2. a malformed token never reaches the database (loadGuestSeat makes no rpc call);
//   3. a seat on another event than the page's slug reads as no seat;
//   4. an RPC error or throw reads as no seat, never as an exception into the page;
//   5. approval outranks status, the way the receipt composes it;
//   6. the mint builds the one URL the receipt carries, and answers null for a row that is not a
//      guest seat, so a failed mint sends the receipt without the link rather than not at all.

const TOKEN = '3f2c1b4a-9d8e-4f7a-8b6c-5d4e3f2a1b0c'

const RAW = {
  rsvp_id: 'r-1',
  event_id: 'e-1',
  slug: 'tuesday-sit',
  title: 'Tuesday sit',
  starts_at: '2027-04-02T18:00:00+00:00',
  ends_at: null,
  time_zone: 'America/Los_Angeles',
  status: 'going',
  approval_status: 'none',
  plus_ones: 2,
  guest_name: 'Sam',
  questions: [
    { id: 'q-1', prompt: 'Dietary needs?', type: 'short_text', options: [], required: false, position: 0, answer: 'none' },
    { id: 'q-2', prompt: 'Pick one', type: 'dropdown', options: ['a', 'b'], required: true, position: 1, answer: '' },
    { id: 'q-x', prompt: 'Broken', type: 'unknown_type', options: [], required: false, position: 2, answer: '' },
  ],
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isSeatToken', () => {
  it('accepts a uuid and nothing else', () => {
    expect(isSeatToken(TOKEN)).toBe(true)
    expect(isSeatToken(TOKEN.toUpperCase())).toBe(true)
    expect(isSeatToken('')).toBe(false)
    expect(isSeatToken('not-a-token')).toBe(false)
    expect(isSeatToken(`${TOKEN}'`)).toBe(false)
    expect(isSeatToken(null)).toBe(false)
    expect(isSeatToken(42)).toBe(false)
  })
})

describe('parseGuestSeat', () => {
  it('keeps the named fields and drops a question of an unknown type', () => {
    const v = parseGuestSeat(RAW)
    expect(v).not.toBeNull()
    expect(v!.rsvpId).toBe('r-1')
    expect(v!.slug).toBe('tuesday-sit')
    expect(v!.plusOnes).toBe(2)
    expect(v!.questions.map((q) => q.id)).toEqual(['q-1', 'q-2'])
    expect(v!.questions[0].answer).toBe('none')
    expect(v!.questions[1].options).toEqual(['a', 'b'])
    expect(v!.questions[1].required).toBe(true)
  })

  it('a hidden venue stays hidden: location, venue, street, host and attendee keys never survive', () => {
    const v = parseGuestSeat({
      ...RAW,
      location: '12 Secret Lane',
      venue_name: 'The Hall',
      street: '12 Secret Lane',
      city: 'Oakland',
      host: { display_name: 'Riley' },
      attendees: ['someone@example.com'],
    })
    expect(v).not.toBeNull()
    const json = JSON.stringify(v)
    expect(json).not.toContain('Secret Lane')
    expect(json).not.toContain('The Hall')
    expect(json).not.toContain('Oakland')
    expect(json).not.toContain('Riley')
    expect(json).not.toContain('someone@example.com')
    expect(Object.keys(v!).sort()).toEqual([
      'approvalStatus', 'endsAt', 'eventId', 'guestName', 'plusOnes', 'questions',
      'rsvpId', 'slug', 'startsAt', 'status', 'timeZone', 'title',
    ])
  })

  it('reads null, a scalar, and a shape missing its seat as no seat', () => {
    expect(parseGuestSeat(null)).toBeNull()
    expect(parseGuestSeat('x')).toBeNull()
    expect(parseGuestSeat({ ...RAW, rsvp_id: undefined })).toBeNull()
    expect(parseGuestSeat({ ...RAW, status: 'attending' })).toBeNull()
    expect(parseGuestSeat({ ...RAW, approval_status: 'maybe' })).toBeNull()
  })

  it('clamps plus-ones to the member rule and tolerates a missing questions array', () => {
    expect(parseGuestSeat({ ...RAW, plus_ones: 40, questions: undefined })!.plusOnes).toBe(5)
    expect(parseGuestSeat({ ...RAW, plus_ones: -3 })!.plusOnes).toBe(0)
    expect(parseGuestSeat({ ...RAW, questions: 'nope' })!.questions).toEqual([])
  })
})

describe('guestSeatState', () => {
  it('lets approval outrank status, as the receipt does', () => {
    expect(guestSeatState({ status: 'going', approvalStatus: 'pending' })).toBe('pending')
    expect(guestSeatState({ status: 'going', approvalStatus: 'none' })).toBe('going')
    expect(guestSeatState({ status: 'going', approvalStatus: 'approved' })).toBe('going')
    expect(guestSeatState({ status: 'waitlist', approvalStatus: 'none' })).toBe('waitlist')
    expect(guestSeatState({ status: 'not_going', approvalStatus: 'none' })).toBe('not_going')
    expect(guestSeatState({ status: 'maybe', approvalStatus: 'none' })).toBe('not_going')
  })
})

describe('loadGuestSeat', () => {
  it('reads through read_guest_seat and returns the parsed seat for the page slug', async () => {
    const rpc = vi.fn(async () => ({ data: RAW, error: null }))
    const v = await loadGuestSeat({ rpc }, TOKEN, 'tuesday-sit')
    expect(rpc).toHaveBeenCalledWith('read_guest_seat', { p_token: TOKEN })
    expect(v?.title).toBe('Tuesday sit')
  })

  it('never calls the database for a malformed token', async () => {
    const rpc = vi.fn(async () => ({ data: RAW, error: null }))
    expect(await loadGuestSeat({ rpc }, 'garbage', 'tuesday-sit')).toBeNull()
    expect(await loadGuestSeat({ rpc }, undefined, 'tuesday-sit')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a seat on another event than the URL names reads as no seat', async () => {
    const rpc = vi.fn(async () => ({ data: RAW, error: null }))
    expect(await loadGuestSeat({ rpc }, TOKEN, 'some-other-event')).toBeNull()
  })

  it('a null from the SQL (wrong, expired, released, claimed) reads as no seat', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    expect(await loadGuestSeat({ rpc }, TOKEN, 'tuesday-sit')).toBeNull()
  })

  it('an RPC error or throw reads as no seat, logged, never thrown into the page', async () => {
    const failing = vi.fn(async () => ({ data: null, error: { message: 'down' } }))
    expect(await loadGuestSeat({ rpc: failing }, TOKEN, 'tuesday-sit')).toBeNull()
    const throwing = vi.fn(async () => { throw new Error('fetch failed') })
    expect(await loadGuestSeat({ rpc: throwing }, TOKEN, 'tuesday-sit')).toBeNull()
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})

describe('mintGuestSeatUrl', () => {
  it('mints through mint_guest_seat_token and builds the one link the receipt carries', async () => {
    const rpc = vi.fn(async () => ({ data: TOKEN, error: null }))
    const url = await mintGuestSeatUrl({ rpc }, 'r-1', 'tuesday-sit', 'https://frequencylocal.com')
    expect(rpc).toHaveBeenCalledWith('mint_guest_seat_token', { p_rsvp_id: 'r-1' })
    expect(url).toBe(`https://frequencylocal.com/events/tuesday-sit/seat/${TOKEN}`)
  })

  it('answers null for a row the SQL refused, an error, or a throw', async () => {
    expect(await mintGuestSeatUrl({ rpc: vi.fn(async () => ({ data: null, error: null })) }, 'r-1', 's', 'https://x')).toBeNull()
    expect(await mintGuestSeatUrl({ rpc: vi.fn(async () => ({ data: null, error: { message: 'no' } })) }, 'r-1', 's', 'https://x')).toBeNull()
    expect(await mintGuestSeatUrl({ rpc: vi.fn(async () => { throw new Error('x') }) }, 'r-1', 's', 'https://x')).toBeNull()
  })

  it('encodes the slug into the path', () => {
    expect(guestSeatPath('a b', TOKEN)).toBe(`/events/a%20b/seat/${TOKEN}`)
  })
})
