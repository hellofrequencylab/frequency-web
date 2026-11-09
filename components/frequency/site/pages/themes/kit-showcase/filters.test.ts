import { describe, expect, it } from 'vitest'
import { kitFacts, kitMatches } from './filters'

// LIVE-1866: the Register and Ready filters read the manifest first and the card second.

const card = (o: Partial<{ reg: string; modes: number; status: Record<string, number> }> = {}) => ({ reg: 'dark', modes: 1, status: { website: 1, spotlight: 1, email: 1, space: 1 }, ...o })

describe('kitFacts', () => {
  it('reads readiness from a manifest with a library entry and both registers from a supported register dial', () => {
    expect(kitFacts(card(), 'bold').ready).toEqual({ website: true, spotlight: false, email: false, space: true })
    expect(kitFacts(card({ modes: 1 }), 'new-world').registers).toBe('both')
  })
  it('falls back to the card where the manifest says nothing', () => {
    expect(kitFacts(card({ status: { website: 1, spotlight: 0, email: 0, space: 1 } }), 'cyberwitch').ready).toEqual({ website: true, spotlight: false, email: false, space: true })
    expect(kitFacts(card({ reg: 'light', modes: 1 }), 'bold').registers).toBe('day')
    expect(kitFacts(card({ reg: 'dark', modes: 2 }), null).registers).toBe('both')
    expect(kitFacts(card({ reg: 'dark', modes: 1 }), 'nope').registers).toBe('night')
  })
})

describe('kitMatches', () => {
  const both = { ready: { website: true, spotlight: false, email: false, space: true }, registers: 'both' as const }
  const night = { ...both, registers: 'night' as const }
  it('shows a both-register kit under Night and Day, and only both-register kits under Both', () => {
    expect(kitMatches(both, { register: 'night', ready: 'all' })).toBe(true)
    expect(kitMatches(both, { register: 'day', ready: 'all' })).toBe(true)
    expect(kitMatches(night, { register: 'day', ready: 'all' })).toBe(false)
    expect(kitMatches(night, { register: 'both', ready: 'all' })).toBe(false)
    expect(kitMatches(both, { register: 'both', ready: 'all' })).toBe(true)
  })
  it('filters on what is ready today', () => {
    expect(kitMatches(both, { register: 'all', ready: 'website' })).toBe(true)
    expect(kitMatches(both, { register: 'all', ready: 'email' })).toBe(false)
    expect(kitMatches(both, { register: 'all', ready: 'all' })).toBe(true)
  })
})
