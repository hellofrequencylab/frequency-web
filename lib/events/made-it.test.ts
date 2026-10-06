import { describe, it, expect } from 'vitest'
import { madeItKey, madeItUrl, makeMadeItToken, verifyMadeItToken } from './made-it'

// LIVE-803: the Yes link is the credential, and a member's Yes shares the check-in's ledger key.
describe('made-it tokens', () => {
  it('verifies the seat it was minted for and nothing else', () => {
    const t = makeMadeItToken('rsvp', 'r1')
    expect(verifyMadeItToken('rsvp', 'r1', t)).toBe(true)
    expect(verifyMadeItToken('rsvp', 'r2', t)).toBe(false)
    expect(verifyMadeItToken('ticket', 'r1', t)).toBe(false)
    expect(verifyMadeItToken('rsvp', 'r1', 'zz')).toBe(false)
  })
  it('builds a link carrying kind, seat and token', () => {
    const u = new URL(madeItUrl('https://x.test', 'ticket', 't9'))
    expect(u.pathname).toBe('/api/events/made-it')
    expect(verifyMadeItToken('ticket', u.searchParams.get('s')!, u.searchParams.get('t')!)).toBe(true)
  })
})

describe('madeItKey', () => {
  it('uses the check-in key for a member and a seat key for a guest', () => {
    expect(madeItKey('e1', { kind: 'rsvp', id: 'r1', profileId: 'p1' })).toBe('event_attend:e1:p1')
    expect(madeItKey('e1', { kind: 'ticket', id: 't1', profileId: null })).toBe('event_attend:e1:ticket:t1')
  })
})
