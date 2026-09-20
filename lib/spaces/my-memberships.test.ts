import { describe, it, expect, vi, beforeEach } from 'vitest'

// MEMBER'S OWN SPACE MEMBERSHIPS (LIVE-423). Network-free:
//   1. Cancelled is not open. Waitlist is.
//   2. ROOT never lists.
//   3. Another member's row is ignored.
//   4. A Space without a slug is omitted rather than linked to a dead URL.
//   5. listMySpaceMemberships binds member_profile_id and the open statuses.
//   6. Fail-safe: signed-out or a thrown read returns [], never a throw.

type MembershipRow = {
  id: string
  space_id: string
  member_profile_id: string
  tier_id: string
  status: string
  billing_interval: string | null
  started_at: string
}

const memberships: MembershipRow[] = []
const spaces: Array<{ id: string; name: string; slug: string; type: string }> = []
const tiers: Array<{ id: string; name: string }> = []
let membershipError: { message: string } | null = null
let viewerId: string | null = 'member-1'
const queries: Array<{ table: string; memberId?: string; statuses?: string[] }> = []

vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => viewerId,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: { table: string; memberId?: string; statuses?: string[]; ids?: string[] } = { table }
      queries.push(q)
      const api = {
        select: () => api,
        eq: (col: string, val: string) => {
          if (col === 'member_profile_id') q.memberId = val
          return api
        },
        in: (col: string, vals: string[]) => {
          if (col === 'status') q.statuses = vals
          if (col === 'id') q.ids = vals
          return api
        },
        order: () => api,
        limit: () => api,
        then: (resolve: (v: { data: unknown; error: { message: string } | null }) => void) => {
          if (table === 'space_memberships') {
            const rows = memberships.filter(
              (r) => r.member_profile_id === q.memberId && (q.statuses ?? []).includes(r.status),
            )
            return resolve({ data: membershipError ? null : rows, error: membershipError })
          }
          if (table === 'spaces') {
            const ids = new Set(q.ids ?? [])
            return resolve({ data: spaces.filter((s) => ids.has(s.id)), error: null })
          }
          if (table === 'space_membership_tiers') {
            const ids = new Set(q.ids ?? [])
            return resolve({ data: tiers.filter((t) => ids.has(t.id)), error: null })
          }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return api
    },
  }),
}))

import {
  foldMySpaceMemberships,
  isMemberFacingSpace,
  isOpenSpaceMembership,
  listMySpaceMemberships,
  membershipCadenceLabel,
} from './my-memberships'

const row = (
  id: string,
  space_id: string,
  member_profile_id: string,
  status: string,
  tier_id = 'tier-1',
): MembershipRow => ({
  id,
  space_id,
  member_profile_id,
  tier_id,
  status,
  billing_interval: 'month',
  started_at: '2026-09-01T00:00:00.000Z',
})

describe('isOpenSpaceMembership', () => {
  it('keeps active and waitlist, drops cancelled', () => {
    expect(isOpenSpaceMembership('active')).toBe(true)
    expect(isOpenSpaceMembership('waitlist')).toBe(true)
    expect(isOpenSpaceMembership('cancelled')).toBe(false)
    expect(isOpenSpaceMembership('past_due')).toBe(false)
  })
})

describe('isMemberFacingSpace', () => {
  it('refuses ROOT', () => {
    expect(isMemberFacingSpace('community')).toBe(true)
    expect(isMemberFacingSpace('root')).toBe(false)
  })
})

describe('membershipCadenceLabel', () => {
  it('names the waitlist before the cadence', () => {
    expect(membershipCadenceLabel('year', 'waitlist')).toBe('On the waitlist')
    expect(membershipCadenceLabel('year', 'active')).toBe('Yearly')
    expect(membershipCadenceLabel('month', 'active')).toBe('Monthly')
  })
})

describe('foldMySpaceMemberships', () => {
  it('drops cancelled, ROOT, other people, and a slug-less Space', () => {
    const list = foldMySpaceMemberships(
      'member-1',
      [
        row('m1', 'space-1', 'member-1', 'active'),
        row('m2', 'space-1', 'member-1', 'cancelled'),
        row('m3', 'root', 'member-1', 'active'),
        row('m4', 'space-2', 'other', 'active'),
        row('m5', 'space-3', 'member-1', 'waitlist'),
        row('m6', 'noslug', 'member-1', 'active'),
      ],
      [
        { id: 'space-1', name: 'House of Fates', slug: 'house-of-fates', type: 'community' },
        { id: 'root', name: 'Frequency', slug: 'frequency', type: 'root' },
        { id: 'space-2', name: 'Other', slug: 'other', type: 'community' },
        { id: 'space-3', name: 'Temple', slug: 'temple', type: 'community' },
        { id: 'noslug', name: 'Ghost', slug: '', type: 'community' },
      ],
      [
        { id: 'tier-1', name: 'Gold' },
      ],
    )
    expect(list.map((m) => m.id)).toEqual(['m1', 'm5'])
    expect(list[0]).toMatchObject({
      spaceSlug: 'house-of-fates',
      spaceName: 'House of Fates',
      tierName: 'Gold',
      status: 'active',
    })
    expect(list[1]?.status).toBe('waitlist')
  })
})

describe('listMySpaceMemberships', () => {
  beforeEach(() => {
    memberships.length = 0
    spaces.length = 0
    tiers.length = 0
    queries.length = 0
    membershipError = null
    viewerId = 'member-1'
    spaces.push({ id: 'space-1', name: 'House of Fates', slug: 'house-of-fates', type: 'community' })
    tiers.push({ id: 'tier-1', name: 'Gold' })
  })

  it('binds the viewer and the open statuses', async () => {
    memberships.push(row('m1', 'space-1', 'member-1', 'active'))
    const list = await listMySpaceMemberships()
    expect(list).toHaveLength(1)
    expect(list[0]?.spaceSlug).toBe('house-of-fates')
    expect(queries.some((q) => q.table === 'space_memberships' && q.memberId === 'member-1')).toBe(true)
    expect(queries.some((q) => q.table === 'space_memberships' && q.statuses?.join() === 'active,waitlist')).toBe(
      true,
    )
  })

  it('returns [] when signed out', async () => {
    viewerId = null
    memberships.push(row('m1', 'space-1', 'member-1', 'active'))
    expect(await listMySpaceMemberships()).toEqual([])
  })

  it('returns [] when the read fails', async () => {
    membershipError = { message: 'boom' }
    expect(await listMySpaceMemberships()).toEqual([])
  })
})
