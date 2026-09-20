import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-429. What is locked: pending is not past due, canceled is not past due,
// billing-off and a miss both return [], ROOT never lists, and the copy names
// the Space without locking the member out.

let currentProfileId: string | null = 'member-1'
let billingOn = true

vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

vi.mock('@/lib/pricing/settings', () => ({
  billingLive: async () => billingOn,
}))

type SpaceRow = { id: string; slug: string; name: string; brandName?: string | null; type: string }
const spaces: Record<string, SpaceRow> = {}
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => spaces[id] ?? null,
}))

type MemRow = {
  id: string
  space_id: string
  member_profile_id: string
  tier_id: string
  status: string
  payment_status: string | null
}
const db = {
  memberships: [] as MemRow[],
  tiers: [] as { id: string; space_id: string; name: string }[],
  throwOnRead: false,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'space_memberships') {
        const filters: { member_profile_id?: string; status?: string; payment_status?: string } = {}
        const api = {
          select() {
            return api
          },
          eq(col: string, val: string) {
            if (col === 'member_profile_id') filters.member_profile_id = val
            if (col === 'status') filters.status = val
            if (col === 'payment_status') filters.payment_status = val
            return api
          },
          then(resolve: (r: { data: MemRow[] | null; error: { message?: string } | null }) => unknown) {
            if (db.throwOnRead) throw new Error('boom')
            const rows = db.memberships.filter(
              (m) =>
                (!filters.member_profile_id || m.member_profile_id === filters.member_profile_id) &&
                (!filters.status || m.status === filters.status) &&
                (!filters.payment_status || m.payment_status === filters.payment_status),
            )
            return Promise.resolve(resolve({ data: rows, error: null }))
          },
        }
        return api
      }
      if (table === 'space_membership_tiers') {
        const filters: { space_id?: string } = {}
        const api = {
          select() {
            return api
          },
          eq(col: string, val: string) {
            if (col === 'space_id') filters.space_id = val
            return api
          },
          then(resolve: (r: { data: { id: string; name: string }[] | null }) => unknown) {
            return Promise.resolve(
              resolve({
                data: db.tiers.filter((t) => !filters.space_id || t.space_id === filters.space_id),
              }),
            )
          },
        }
        return api
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  isPastDueSpaceMembership,
  listMyPastDueSpaceMemberships,
  spacePastDueMemberBody,
  spacePastDueMemberTitle,
  spacePastDueOwnerLabel,
} from './membership-dunning'

describe('isPastDueSpaceMembership', () => {
  it('is only true for past_due', () => {
    expect(isPastDueSpaceMembership('past_due')).toBe(true)
    expect(isPastDueSpaceMembership('pending')).toBe(false)
    expect(isPastDueSpaceMembership('active')).toBe(false)
    expect(isPastDueSpaceMembership('canceled')).toBe(false)
    expect(isPastDueSpaceMembership(null)).toBe(false)
    expect(isPastDueSpaceMembership(undefined)).toBe(false)
  })
})

describe('space past-due copy', () => {
  it('names the Space and keeps the member in', () => {
    expect(spacePastDueMemberTitle()).toBe('Your last payment did not go through')
    const body = spacePastDueMemberBody('Royal Temple')
    expect(body).toContain('Royal Temple')
    expect(body).toContain('still a member')
    expect(body).not.toContain('\u2014')
    expect(spacePastDueOwnerLabel()).toBe('Payment failed')
  })
})

describe('listMyPastDueSpaceMemberships', () => {
  beforeEach(() => {
    currentProfileId = 'member-1'
    billingOn = true
    db.memberships = []
    db.tiers = []
    db.throwOnRead = false
    for (const k of Object.keys(spaces)) delete spaces[k]
  })

  it('returns [] when signed out', async () => {
    currentProfileId = null
    expect(await listMyPastDueSpaceMemberships()).toEqual([])
  })

  it('returns [] while billing is off', async () => {
    billingOn = false
    db.memberships.push({
      id: 'm1',
      space_id: 'sp1',
      member_profile_id: 'member-1',
      tier_id: 't1',
      status: 'active',
      payment_status: 'past_due',
    })
    expect(await listMyPastDueSpaceMemberships()).toEqual([])
  })

  it('returns [] on a thrown read', async () => {
    db.throwOnRead = true
    expect(await listMyPastDueSpaceMemberships()).toEqual([])
  })

  it('lists an active past_due membership and skips ROOT, pending, and other people', async () => {
    spaces.sp1 = { id: 'sp1', slug: 'royal-temple', name: 'Royal Temple', type: 'space' }
    spaces.root = { id: 'root', slug: 'root', name: 'Frequency', type: 'root' }
    db.tiers.push({ id: 't1', space_id: 'sp1', name: 'Patron' })
    db.memberships.push(
      {
        id: 'm1',
        space_id: 'sp1',
        member_profile_id: 'member-1',
        tier_id: 't1',
        status: 'active',
        payment_status: 'past_due',
      },
      {
        id: 'm-pending',
        space_id: 'sp1',
        member_profile_id: 'member-1',
        tier_id: 't1',
        status: 'active',
        payment_status: 'pending',
      },
      {
        id: 'm-root',
        space_id: 'root',
        member_profile_id: 'member-1',
        tier_id: 't1',
        status: 'active',
        payment_status: 'past_due',
      },
      {
        id: 'm-other',
        space_id: 'sp1',
        member_profile_id: 'someone-else',
        tier_id: 't1',
        status: 'active',
        payment_status: 'past_due',
      },
    )
    const rows = await listMyPastDueSpaceMemberships()
    expect(rows).toEqual([
      {
        membershipId: 'm1',
        spaceId: 'sp1',
        spaceName: 'Royal Temple',
        spaceSlug: 'royal-temple',
        tierName: 'Patron',
      },
    ])
  })
})
