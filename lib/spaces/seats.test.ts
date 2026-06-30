import { describe, it, expect, beforeEach, vi } from 'vitest'

// LICENSED SEATS + SEAT-LIMIT ENFORCEMENT (Pricing ladder Phase D, ADR-465). Two halves locked here:
//   1. The PURE seat arithmetic (operatorRoleConsumesSeat / licensedSeats / seatLimitReached /
//      seatsRemaining) — no IO, the seat-counting rule made explicit.
//   2. The billing_live-GATED enforcement (checkSeatForOperatorInvite): grant-all while OFF (the P1
//      invariant), the licensed limit enforced when live, viewers never consuming a seat.
// The DB (used-seat count + the licensed count) and billingLive() are mocked so the gate is the unit
// under test.

const { mockBillingLive, seatQuantityMaybeSingle, membersCount } = vi.hoisted(() => ({
  mockBillingLive: vi.fn(),
  seatQuantityMaybeSingle: vi.fn(),
  membersCount: vi.fn(),
}))

vi.mock('@/lib/pricing/settings', () => ({
  billingLive: mockBillingLive,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'spaces') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: seatQuantityMaybeSingle }) }),
        }
      }
      if (table === 'space_members') {
        // .select('id', { count, head }).eq().eq().in() -> resolves to { count, error }
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ in: membersCount }) }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  BASE_SEAT_ALLOWANCE,
  operatorRoleConsumesSeat,
  licensedSeats,
  seatsRemaining,
  seatLimitReached,
  getSpaceSeatQuantity,
  usedSeats,
  getSeatUsage,
  checkSeatForOperatorInvite,
  SEAT_CONSUMING_ROLES,
} from './seats'

describe('seat arithmetic (PURE — the seat-counting rule)', () => {
  it('operator roles (editor / moderator / admin) consume a seat; viewer does not', () => {
    expect(operatorRoleConsumesSeat('admin')).toBe(true)
    expect(operatorRoleConsumesSeat('moderator')).toBe(true)
    expect(operatorRoleConsumesSeat('editor')).toBe(true)
    expect(operatorRoleConsumesSeat('viewer')).toBe(false)
  })

  it('an unknown / null role consumes no seat (fail-closed)', () => {
    expect(operatorRoleConsumesSeat(null)).toBe(false)
    expect(operatorRoleConsumesSeat(undefined)).toBe(false)
    expect(operatorRoleConsumesSeat('owner')).toBe(false) // not a member-row role
    expect(operatorRoleConsumesSeat('')).toBe(false)
  })

  it('SEAT_CONSUMING_ROLES matches operatorRoleConsumesSeat', () => {
    for (const r of SEAT_CONSUMING_ROLES) expect(operatorRoleConsumesSeat(r)).toBe(true)
    expect((SEAT_CONSUMING_ROLES as readonly string[]).includes('viewer')).toBe(false)
  })

  it('licensedSeats = base allowance (1) + the licensed count', () => {
    expect(BASE_SEAT_ALLOWANCE).toBe(1)
    expect(licensedSeats(0)).toBe(1) // owner only
    expect(licensedSeats(4)).toBe(5) // base 1 + 4 licensed = "5 seats"
    expect(licensedSeats(1)).toBe(2)
  })

  it('licensedSeats floors garbage / negative counts to the base allowance', () => {
    expect(licensedSeats(null)).toBe(1)
    expect(licensedSeats(undefined)).toBe(1)
    expect(licensedSeats(-3)).toBe(1)
    expect(licensedSeats(Number.NaN)).toBe(1)
    expect(licensedSeats(2.9)).toBe(3) // floors the added count
  })

  it('seatsRemaining never goes negative', () => {
    expect(seatsRemaining(2, 5)).toBe(3)
    expect(seatsRemaining(5, 5)).toBe(0)
    expect(seatsRemaining(7, 5)).toBe(0) // over-seated reads as 0 remaining
  })

  it('seatLimitReached is true at or over the licensed total', () => {
    expect(seatLimitReached(4, 5)).toBe(false)
    expect(seatLimitReached(5, 5)).toBe(true)
    expect(seatLimitReached(6, 5)).toBe(true)
    expect(seatLimitReached(0, 1)).toBe(false) // a fresh space (owner only) has room
  })
})

describe('IO reads (FAIL-SAFE)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getSpaceSeatQuantity reads spaces.seat_quantity, clamps to >= 0', async () => {
    seatQuantityMaybeSingle.mockResolvedValue({ data: { seat_quantity: 4 } })
    expect(await getSpaceSeatQuantity('s1')).toBe(4)
    seatQuantityMaybeSingle.mockResolvedValue({ data: { seat_quantity: -2 } })
    expect(await getSpaceSeatQuantity('s1')).toBe(0)
  })

  it('getSpaceSeatQuantity fails safe to 0 on a missing row / error', async () => {
    seatQuantityMaybeSingle.mockResolvedValue({ data: null })
    expect(await getSpaceSeatQuantity('s1')).toBe(0)
    seatQuantityMaybeSingle.mockRejectedValue(new Error('db down'))
    expect(await getSpaceSeatQuantity('s1')).toBe(0)
  })

  it('usedSeats returns the active-operator count, fails safe to 0', async () => {
    membersCount.mockResolvedValue({ count: 3, error: null })
    expect(await usedSeats('s1')).toBe(3)
    membersCount.mockResolvedValue({ count: null, error: { message: 'boom' } })
    expect(await usedSeats('s1')).toBe(0)
  })
})

describe('checkSeatForOperatorInvite (the billing_live-GATED enforcement)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: a full space (used == licensed) so the gate would block IF enforced.
    seatQuantityMaybeSingle.mockResolvedValue({ data: { seat_quantity: 1 } }) // licensed = 2
    membersCount.mockResolvedValue({ count: 2, error: null }) // used = 2 -> full
  })

  it('GATED: while billing is OFF, an operator invite is ALWAYS allowed (grant-all preserved)', async () => {
    mockBillingLive.mockResolvedValue(false)
    const res = await checkSeatForOperatorInvite('s1', 'editor')
    expect(res.allowed).toBe(true)
    expect(res.usage.full).toBe(true) // the usage still reports full, but the gate does not block
  })

  it('when billing is LIVE and the space is full, an operator invite is BLOCKED with a clean reason', async () => {
    mockBillingLive.mockResolvedValue(true)
    const res = await checkSeatForOperatorInvite('s1', 'admin')
    expect(res.allowed).toBe(false)
    expect(res.reason).toBeTruthy()
    expect(res.reason).not.toContain('—') // no em dashes (voice rule)
    expect(res.reason).toContain('2') // names the licensed allowance
  })

  it('when billing is LIVE but a seat is free, an operator invite is allowed', async () => {
    mockBillingLive.mockResolvedValue(true)
    membersCount.mockResolvedValue({ count: 1, error: null }) // used 1 of licensed 2
    const res = await checkSeatForOperatorInvite('s1', 'moderator')
    expect(res.allowed).toBe(true)
    expect(res.usage.remaining).toBe(1)
  })

  it('a VIEWER invite never consumes a seat, so it passes even when full + live', async () => {
    mockBillingLive.mockResolvedValue(true)
    const res = await checkSeatForOperatorInvite('s1', 'viewer')
    expect(res.allowed).toBe(true)
    // billingLive is never even consulted for a non-seat role (short-circuit before the gate).
    expect(mockBillingLive).not.toHaveBeenCalled()
  })

  it('getSeatUsage composes the licensed + used reads into the rendered shape', async () => {
    seatQuantityMaybeSingle.mockResolvedValue({ data: { seat_quantity: 4 } }) // licensed 5
    membersCount.mockResolvedValue({ count: 3, error: null })
    const usage = await getSeatUsage('s1')
    expect(usage).toEqual({ seatQuantity: 4, licensed: 5, used: 3, remaining: 2, full: false })
  })
})
