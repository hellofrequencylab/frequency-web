import { describe, it, expect } from 'vitest'
import {
  audienceEmailsByProfile,
  pairSpaceContacts,
  type RootContactRow,
  type SpaceContactRow,
} from './contact-audience'

// The regression this file exists for: the Space Message center's email lane resolved its
// recipients by `contacts.profile_id` inside a TENANT space, where per-space tenancy
// (ADR-624) guarantees `profile_id` is NULL. The join must be on EMAIL, and a member is
// emailable only when the SENDING space already holds a contact card for that address.

describe('audienceEmailsByProfile', () => {
  const rows: RootContactRow[] = [
    { profile_id: 'p1', email: 'Ada@Example.com' },
    { profile_id: 'p2', email: 'grace@example.com' },
    { profile_id: 'p3', email: null },
    { profile_id: null, email: 'orphan@example.com' },
  ]

  it('lowercases addresses so an un-normalized platform row still matches', () => {
    expect(audienceEmailsByProfile(rows, ['p1']).get('p1')).toBe('ada@example.com')
  })

  it('keeps only profiles that are actually in the audience', () => {
    const out = audienceEmailsByProfile(rows, ['p2'])
    expect([...out.keys()]).toEqual(['p2'])
  })

  it('drops rows with no address and rows with no profile link', () => {
    const out = audienceEmailsByProfile(rows, ['p1', 'p2', 'p3'])
    expect([...out.keys()].sort()).toEqual(['p1', 'p2'])
  })

  it('first row wins, so a duplicate platform record cannot flip an address', () => {
    const dupes: RootContactRow[] = [
      { profile_id: 'p1', email: 'first@example.com' },
      { profile_id: 'p1', email: 'second@example.com' },
    ]
    expect(audienceEmailsByProfile(dupes, ['p1']).get('p1')).toBe('first@example.com')
  })

  it('is empty for empty / missing input', () => {
    expect(audienceEmailsByProfile(null, ['p1']).size).toBe(0)
    expect(audienceEmailsByProfile(rows, []).size).toBe(0)
  })
})

describe('pairSpaceContacts', () => {
  const audience = new Map([
    ['p1', 'ada@example.com'],
    ['p2', 'grace@example.com'],
  ])

  it('pairs a member to the SPACE contact holding their address', () => {
    const spaceRows: SpaceContactRow[] = [{ id: 'c-ada', email: 'ada@example.com' }]
    expect(pairSpaceContacts(audience, spaceRows)).toEqual([
      { profileId: 'p1', contactId: 'c-ada', email: 'ada@example.com' },
    ])
  })

  it('matches case-insensitively on the space row too', () => {
    const spaceRows: SpaceContactRow[] = [{ id: 'c-ada', email: '  ADA@Example.com ' }]
    expect(pairSpaceContacts(audience, spaceRows)).toHaveLength(1)
  })

  it('NEVER requires a profile link on the space row (the ADR-624 membrane)', () => {
    // Tenant contact rows carry profile_id NULL. The shape here has no profile field at all,
    // which is the point: nothing in this join can regress to keying on it.
    const spaceRows: SpaceContactRow[] = [
      { id: 'c-ada', email: 'ada@example.com' },
      { id: 'c-grace', email: 'grace@example.com' },
    ]
    expect(pairSpaceContacts(audience, spaceRows).map((r) => r.profileId).sort()).toEqual(['p1', 'p2'])
  })

  it('drops a member the space holds no contact for', () => {
    const spaceRows: SpaceContactRow[] = [{ id: 'c-ada', email: 'ada@example.com' }]
    const out = pairSpaceContacts(audience, spaceRows)
    expect(out.some((r) => r.profileId === 'p2')).toBe(false)
  })

  it('mails a shared mailbox once', () => {
    const shared = new Map([
      ['p1', 'team@example.com'],
      ['p2', 'team@example.com'],
    ])
    const spaceRows: SpaceContactRow[] = [{ id: 'c-team', email: 'team@example.com' }]
    expect(pairSpaceContacts(shared, spaceRows)).toHaveLength(1)
  })

  it('drops space rows with no address or no id', () => {
    const spaceRows: SpaceContactRow[] = [
      { id: '', email: 'ada@example.com' },
      { id: 'c-grace', email: null },
    ]
    expect(pairSpaceContacts(audience, spaceRows)).toEqual([])
  })

  it('is empty for empty / missing input', () => {
    expect(pairSpaceContacts(audience, null)).toEqual([])
    expect(pairSpaceContacts(new Map(), [{ id: 'c', email: 'a@b.com' }])).toEqual([])
  })
})
