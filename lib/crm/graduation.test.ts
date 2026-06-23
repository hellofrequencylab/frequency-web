import { describe, it, expect } from 'vitest'
import { matchesGraduationFilter } from './graduation'
import type { NetworkContactListItem } from '@/lib/connections/types'

// GRADUATION FILTER (CRM-STRATEGY §6, P3). The pure status/tag narrowing the import applies before it
// brings personal contacts into a Space CRM. Network-free: it locks that an absent filter matches all,
// status is exact, and tag is case-insensitive.

function contact(over: Partial<NetworkContactListItem>): NetworkContactListItem {
  return {
    id: 'c1',
    ownerId: 'o1',
    visibility: 'private',
    source: 'manual',
    status: 'active',
    displayName: 'Pat',
    email: 'pat@example.com',
    phone: null,
    title: null,
    company: null,
    city: null,
    website: null,
    socials: {},
    avatarPath: null,
    details: {},
    cardFrontPath: null,
    cardBackPath: null,
    logoPath: null,
    linkedProfileId: null,
    linkedContactId: null,
    lastContactedAt: null,
    createdAt: null,
    updatedAt: null,
    tags: ['Client', 'VIP'],
    avatarUrl: null,
    ...over,
  }
}

describe('matchesGraduationFilter', () => {
  it('an empty filter matches every contact', () => {
    expect(matchesGraduationFilter(contact({}), {})).toBe(true)
    expect(matchesGraduationFilter(contact({ status: 'archived', tags: [] }), {})).toBe(true)
  })

  it('status is an exact lifecycle match', () => {
    expect(matchesGraduationFilter(contact({ status: 'active' }), { status: 'active' })).toBe(true)
    expect(matchesGraduationFilter(contact({ status: 'new' }), { status: 'active' })).toBe(false)
  })

  it('tag matches case-insensitively against the contact tags', () => {
    expect(matchesGraduationFilter(contact({ tags: ['Client'] }), { tag: 'client' })).toBe(true)
    expect(matchesGraduationFilter(contact({ tags: ['Client'] }), { tag: 'CLIENT' })).toBe(true)
    expect(matchesGraduationFilter(contact({ tags: ['Lead'] }), { tag: 'client' })).toBe(false)
    expect(matchesGraduationFilter(contact({ tags: [] }), { tag: 'client' })).toBe(false)
  })

  it('an all-whitespace tag is ignored (treated as no tag filter)', () => {
    expect(matchesGraduationFilter(contact({ tags: [] }), { tag: '   ' })).toBe(true)
  })

  it('status and tag both apply (AND)', () => {
    const c = contact({ status: 'active', tags: ['client'] })
    expect(matchesGraduationFilter(c, { status: 'active', tag: 'client' })).toBe(true)
    expect(matchesGraduationFilter(c, { status: 'archived', tag: 'client' })).toBe(false)
    expect(matchesGraduationFilter(c, { status: 'active', tag: 'lead' })).toBe(false)
  })
})
