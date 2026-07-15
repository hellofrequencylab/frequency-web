import { describe, it, expect, vi } from 'vitest'

// resolveSegment for the Resonance CRM composer's audience kinds (network-free, admin client mocked
// over an in-memory `contacts` table). Locks that:
//   • profile:<id> / profiles:<id,...> map profile ids onto member contacts, unsubscribed excluded.
//   • contact:<id> / contacts:<id,...> resolve contacts by id; a contact with no profile is dropped.
//   • event:<id> resolves through the Event Dispatch fan-out, then maps onto contacts.
//   • an empty / bare selector is nobody (fail-safe), never everybody.

// In-memory contacts: subscribed + unsubscribed + a profile-less row + an unknown-consent row.
const contacts = [
  { id: 'k1', email: 'a@x.com', profile_id: 'p1', consent_state: 'subscribed' },
  { id: 'k2', email: 'b@x.com', profile_id: 'p2', consent_state: 'unsubscribed' },
  { id: 'k3', email: 'c@x.com', profile_id: null, consent_state: 'subscribed' },
  { id: 'k4', email: 'd@x.com', profile_id: 'p4', consent_state: 'unknown' },
]

function contactsBuilder() {
  const state: { col?: string; vals?: string[] } = {}
  const api = {
    select() {
      return api
    },
    in(col: string, vals: string[]) {
      state.col = col
      state.vals = vals
      return api
    },
    neq(_col: string, val: string) {
      const rows = contacts.filter((c) => {
        const key = state.col === 'id' ? c.id : (c.profile_id as string | null)
        const inSet = key != null && state.vals!.includes(key)
        return inSet && c.consent_state !== val
      })
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'contacts') return contactsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

// The event fan-out resolves ev1 -> p1, p2, p4 (guests + hosting Circle); anything else is nobody.
vi.mock('@/lib/events/dispatch-audience', () => ({
  resolveEventDispatchAudience: vi.fn(async (id: string) => (id === 'ev1' ? ['p1', 'p2', 'p4'] : [])),
}))

import { resolveSegment } from './campaigns'

const ids = (rs: { contactId: string }[]) => rs.map((r) => r.contactId).sort()

describe('resolveSegment — direct member selectors', () => {
  it('profile:<id> resolves the one member, unsubscribed excluded', async () => {
    expect(ids(await resolveSegment('profile:p1'))).toEqual(['k1'])
    expect(await resolveSegment('profile:p2')).toEqual([]) // unsubscribed
  })

  it('profiles:<id,...> resolves the set, excluding unsubscribed', async () => {
    // p1 subscribed, p2 unsubscribed (out), p4 unknown (in).
    expect(ids(await resolveSegment('profiles:p1,p2,p4'))).toEqual(['k1', 'k4'])
  })
})

describe('resolveSegment — direct contact selectors', () => {
  it('contacts:<id,...> resolves by contact id; a profile-less contact is dropped', async () => {
    // k1 in, k3 has no profile (dropped), k4 in.
    expect(ids(await resolveSegment('contacts:k1,k3,k4'))).toEqual(['k1', 'k4'])
  })

  it('contact:<id> for an unsubscribed contact is nobody', async () => {
    expect(await resolveSegment('contact:k2')).toEqual([])
  })
})

describe('resolveSegment — event RSVP audience', () => {
  it('event:<id> maps the dispatch fan-out onto contacts, unsubscribed excluded', async () => {
    expect(ids(await resolveSegment('event:ev1'))).toEqual(['k1', 'k4'])
  })

  it('an unknown event is nobody (fail-safe)', async () => {
    expect(await resolveSegment('event:nope')).toEqual([])
  })
})

describe('resolveSegment — fail-safe on empty selectors', () => {
  it('a bare selector resolves to nobody, never everybody', async () => {
    expect(await resolveSegment('profiles:')).toEqual([])
    expect(await resolveSegment('profile:')).toEqual([])
    expect(await resolveSegment('contacts:')).toEqual([])
    expect(await resolveSegment('event:')).toEqual([])
  })
})
