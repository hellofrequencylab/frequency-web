import { describe, it, expect, beforeEach, vi } from 'vitest'

// The claim trust gate is the anti-claim-farming core, so its verdicts are locked
// by fixtures. We drive isValidClaim() against a controllable admin-client mock:
// each table returns whatever the per-test `state` says, regardless of how the
// query is chained (.eq/.not/.limit/.maybeSingle/count+head/.then).

interface MockState {
  // events: a reciprocal claim row exists (claimer posted, poster hosts) when true.
  reciprocal: boolean
  // profiles.created_at for the claimer.
  createdAt: string | null
  // community-history counts for the claimer.
  membershipCount: number
  practiceCount: number
  rsvpCount: number
}

const state: MockState = {
  reciprocal: false,
  createdAt: null,
  membershipCount: 0,
  practiceCount: 0,
  rsvpCount: 0,
}

// A chainable builder. Filter methods return `this`; the terminals
// (maybeSingle / count+head via .then) resolve from `state` based on `table`.
function builder(table: string) {
  const self: Record<string, unknown> = {}
  const chain = () => self
  self.select = chain
  self.eq = chain
  self.in = chain
  self.is = chain
  self.not = chain
  self.limit = chain
  self.order = chain

  self.maybeSingle = async () => {
    if (table === 'events') {
      // reciprocal probe: a row means a reciprocal claim exists.
      return { data: state.reciprocal ? { id: 'recip-event' } : null }
    }
    if (table === 'profiles') {
      return { data: state.createdAt ? { created_at: state.createdAt } : null }
    }
    return { data: null }
  }

  // count+head probes resolve via .then(onFulfilled).
  self.then = (onFulfilled: (r: { count: number }) => unknown) => {
    const count =
      table === 'memberships'
        ? state.membershipCount
        : table === 'practice_logs'
          ? state.practiceCount
          : table === 'event_rsvps'
            ? state.rsvpCount
            : 0
    return Promise.resolve(onFulfilled({ count }))
  }

  return self
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

import { isValidClaim } from './claim-trust'

const POSTER = 'poster-1'
const CLAIMER = 'claimer-1'
const LONG_AGO = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days
const JUST_NOW = new Date(Date.now() - 1000 * 60 * 60).toISOString() // 1h ago

describe('isValidClaim', () => {
  beforeEach(() => {
    state.reciprocal = false
    state.createdAt = LONG_AGO
    state.membershipCount = 0
    state.practiceCount = 0
    state.rsvpCount = 0
  })

  it('self-claim: poster claiming their own event is not valid (no bonus)', async () => {
    const r = await isValidClaim(POSTER, POSTER)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('self_claim')
  })

  it('no poster on record: not valid (nothing to pay)', async () => {
    const r = await isValidClaim(null, CLAIMER)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('self_claim')
  })

  it('reciprocal ring: a -> b and b -> a pays no bonus', async () => {
    state.reciprocal = true
    const r = await isValidClaim(POSTER, CLAIMER)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('reciprocal')
  })

  it('sockpuppet: fresh account with no community history is not valid', async () => {
    state.createdAt = JUST_NOW
    state.membershipCount = 0
    state.practiceCount = 0
    state.rsvpCount = 0
    const r = await isValidClaim(POSTER, CLAIMER)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('sockpuppet')
  })

  it('fresh account WITH community history is a genuine claim (full credit)', async () => {
    state.createdAt = JUST_NOW
    state.membershipCount = 1 // has a membership: established despite being new
    const r = await isValidClaim(POSTER, CLAIMER)
    expect(r.valid).toBe(true)
    expect(r.reason).toBe(null)
  })

  it('genuine claim: established account, no reciprocity, full credit', async () => {
    state.createdAt = LONG_AGO
    const r = await isValidClaim(POSTER, CLAIMER)
    expect(r.valid).toBe(true)
    expect(r.reason).toBe(null)
  })
})
