import { describe, it, expect, beforeEach, vi } from 'vitest'

// HOUSEHOLD / CIRCLE BUNDLE SEAT INVITES (ADR-370) — the post-purchase half. This is money too, and
// the four things that have to hold are pinned here directly:
//
//   (a) SEAT ACCOUNTING CANNOT OVERSELL. A pending invite occupies a seat, so an owner cannot offer
//       more seats than the bundle was bought with and have two people accept into nothing.
//   (b) ONLY THE OWNER may send or revoke; ONLY THE INVITEE may accept or decline. Nobody is seated
//       without agreeing, which is the whole reason this is an invite and not an assignment.
//   (c) 🔴 ACCEPTING DOES NOT ADVANCE profiles.household_bundle_event_at. That column orders STRIPE
//       events: apply_bundle_seating_atomic drops any event created at or before it. Push it to now()
//       on an acceptance and the real customer.subscription.deleted arrives looking stale, is
//       dropped, and a CANCELED bundle stays seated with everyone on a paid tier for free. Two tests
//       below fail if that ever happens — one on the value, one on the ROUTE (an acceptance that
//       reached for apply_bundle_seating_atomic would advance it by construction).
//   (d) ACCEPTING TWICE SEATS ONCE, and does not re-record the pre-bundle tier from the tier the
//       bundle itself just granted (which would turn leaving the bundle into a free upgrade).
//
// The fakes below MODEL the plpgsql in migration 20270226000100 statement for statement, so the
// module is exercised end to end. The real SQL is pinned separately by
// supabase/tests/household_bundle_invites.test.sql (pgTAP, run by .github/workflows/db-tests.yml
// against a freshly-migrated database), which is the only thing that can prove the transaction.

interface Profile {
  id: string
  display_name: string
  handle: string
  avatar_url?: string | null
  membership_tier?: string | null
  membership_payment_status?: string | null
  household_bundle_id?: string | null
  household_bundle_prior_tier?: string | null
  household_bundle_event_at?: string | null
  household_bundle_seats?: number | null
  household_bundle_tier?: string | null
}

interface Invite {
  id: string
  owner_profile_id: string
  to_profile_id: string
  status: string
  created_at: string
  expires_at: string
  responded_at?: string | null
}

const H = vi.hoisted(() => ({
  profiles: [] as Record<string, unknown>[],
  invites: [] as Record<string, unknown>[],
  notifications: [] as Record<string, unknown>[],
  /** Every column name any UPDATE touched, across every table. The event-stamp guard reads this. */
  written: [] as string[],
  /** Every RPC the module reached for, by name. The route guard reads this. */
  rpcs: [] as string[],
  seq: 0,
}))

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const ADA = '00000000-0000-0000-0000-0000000000a2'
const BEN = '00000000-0000-0000-0000-0000000000a3'
const CLEO = '00000000-0000-0000-0000-0000000000a4'

function rows(name: string): Record<string, unknown>[] {
  if (name === 'profiles') return H.profiles
  if (name === 'household_bundle_invites') return H.invites
  if (name === 'notifications') return H.notifications
  throw new Error(`unexpected table ${name}`)
}

/** A tiny in-memory stand-in for the PostgREST builder: only the operators this module uses. */
function builder(name: string) {
  const filters: ((r: Record<string, unknown>) => boolean)[] = []
  let pending: { kind: 'insert' | 'update'; payload: Record<string, unknown> } | null = null

  const matched = () => rows(name).filter((r) => filters.every((f) => f(r)))

  const run = (): { data: Record<string, unknown>[] | null; error: { code?: string } | null } => {
    if (pending?.kind === 'insert') {
      const row: Record<string, unknown> = { id: `id-${++H.seq}`, ...pending.payload }
      // The one-pending partial unique index, modelled: it is the race guard the SQL relies on.
      if (
        name === 'household_bundle_invites' &&
        H.invites.some(
          (r) =>
            r.owner_profile_id === row.owner_profile_id &&
            r.to_profile_id === row.to_profile_id &&
            r.status === 'pending',
        )
      ) {
        return { data: null, error: { code: '23505' } }
      }
      rows(name).push(row)
      return { data: [row], error: null }
    }
    if (pending?.kind === 'update') {
      const hit = matched()
      for (const r of hit) Object.assign(r, pending.payload)
      H.written.push(...Object.keys(pending.payload))
      return { data: hit, error: null }
    }
    return { data: matched(), error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: () => api,
    insert: (payload: Record<string, unknown>) => {
      pending = { kind: 'insert', payload }
      return api
    },
    update: (payload: Record<string, unknown>) => {
      pending = { kind: 'update', payload }
      return api
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val)
      return api
    },
    in: (col: string, vals: readonly unknown[]) => {
      filters.push((r) => vals.includes(r[col] as never))
      return api
    },
    gt: (col: string, val: unknown) => {
      filters.push((r) => String(r[col]) > String(val))
      return api
    },
    maybeSingle: async () => {
      const r = run()
      return { data: (r.data ?? [])[0] ?? null, error: r.error }
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(run())),
  }
  return api
}

/** The model of create_bundle_invite_atomic (migration 20270226000100 §5). */
function createBundleInviteAtomic(args: { _owner: string; _invitee: string; _seats_fallback: number }) {
  if (args._owner === args._invitee) return { created: false, reason: 'self' }
  const owner = H.profiles.find((r) => r.id === args._owner) as Profile | undefined
  if (!owner || owner.household_bundle_id !== args._owner) {
    return { created: false, reason: 'bundle_inactive' }
  }
  const cap = Math.max(owner.household_bundle_seats ?? args._seats_fallback ?? 1, 1)

  // Sweep elapsed pending invites first: an unanswered offer gives its seat back.
  for (const i of H.invites as unknown as Invite[]) {
    if (i.owner_profile_id === args._owner && i.status === 'pending' && new Date(i.expires_at) <= new Date()) {
      i.status = 'expired'
    }
  }

  const invitee = H.profiles.find((r) => r.id === args._invitee) as Profile | undefined
  if (!invitee) return { created: false, reason: 'no_member' }
  if (invitee.household_bundle_id === args._owner) return { created: false, reason: 'already_seated' }
  if (invitee.household_bundle_id) return { created: false, reason: 'in_other_bundle' }

  const live = (H.invites as unknown as Invite[]).filter(
    (i) => i.owner_profile_id === args._owner && i.status === 'pending',
  )
  if (live.some((i) => i.to_profile_id === args._invitee)) {
    return { created: false, reason: 'already_invited' }
  }
  const seated = (H.profiles as unknown as Profile[]).filter((p) => p.household_bundle_id === args._owner).length
  if (seated + live.length >= cap) return { created: false, reason: 'no_seats', seats: cap }

  const id = `id-${++H.seq}`
  H.invites.push({
    id,
    owner_profile_id: args._owner,
    to_profile_id: args._invitee,
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
  })
  return { created: true, invite_id: id, seats: cap, remaining: cap - seated - live.length - 1 }
}

/** The model of accept_bundle_invite_atomic (migration 20270226000100 §6).
 *  🔴 It writes the seat and NOTHING else. household_bundle_event_at is deliberately absent. */
function acceptBundleInviteAtomic(args: {
  _invite: string
  _member: string
  _tier_fallback: string
  _seats_fallback: number
}) {
  const invite = H.invites.find((r) => r.id === args._invite) as unknown as Invite | undefined
  if (!invite) return { seated: false, reason: 'not_found' }
  if (invite.to_profile_id !== args._member) return { seated: false, reason: 'not_yours' }
  if (invite.status !== 'pending') return { seated: false, reason: 'already_answered' }
  if (new Date(invite.expires_at) <= new Date()) {
    invite.status = 'expired'
    return { seated: false, reason: 'expired' }
  }

  const owner = H.profiles.find((r) => r.id === invite.owner_profile_id) as Profile | undefined
  if (!owner || owner.household_bundle_id !== invite.owner_profile_id) {
    return { seated: false, reason: 'bundle_inactive' }
  }
  const cap = Math.max(owner.household_bundle_seats ?? args._seats_fallback ?? 1, 1)
  const tier = owner.household_bundle_tier ?? args._tier_fallback
  if (tier !== 'crew' && tier !== 'supporter') return { seated: false, reason: 'invalid_tier' }

  const member = H.profiles.find((r) => r.id === args._member) as Profile | undefined
  if (!member) return { seated: false, reason: 'no_member' }
  if (member.household_bundle_id && member.household_bundle_id !== invite.owner_profile_id) {
    return { seated: false, reason: 'in_other_bundle' }
  }
  const seated = (H.profiles as unknown as Profile[]).filter(
    (p) => p.household_bundle_id === invite.owner_profile_id,
  ).length
  if (!member.household_bundle_id && seated >= cap) return { seated: false, reason: 'no_seats', seats: cap }

  invite.status = 'accepted'
  invite.responded_at = new Date().toISOString()

  // `is distinct from` in the SQL: an already-seated member matches nothing, so prior_tier is
  // recorded exactly once, on the way in.
  if (member.household_bundle_id !== invite.owner_profile_id) {
    member.household_bundle_prior_tier = member.membership_tier ?? 'free'
    member.household_bundle_id = invite.owner_profile_id
    if ((member.membership_tier ?? 'free') === 'free') member.membership_tier = tier
  }
  return { seated: true, owner: invite.owner_profile_id, tier }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (name: string) => builder(name),
    rpc: (name: string, args: Record<string, unknown>) => {
      H.rpcs.push(name)
      if (name === 'create_bundle_invite_atomic') {
        return Promise.resolve({ data: createBundleInviteAtomic(args as never), error: null })
      }
      if (name === 'accept_bundle_invite_atomic') {
        return Promise.resolve({ data: acceptBundleInviteAtomic(args as never), error: null })
      }
      throw new Error(`unexpected rpc ${name}`)
    },
  }),
}))

vi.mock('@/lib/pricing/settings', () => ({
  getHouseholdBundle: async () => ({ seats: 3, monthly_cents: 2400, annual_cents: 24000, tier: 'crew' }),
}))

import {
  bundleSeatsOpen,
  canSendBundleSeatInvite,
  canRevokeBundleSeatInvite,
  canAnswerBundleSeatInvite,
  loadBundleSeatBoard,
  sendBundleSeatInvite,
  respondToBundleSeatInvite,
  revokeBundleSeatInvite,
} from './bundle-invites'

const STAMP = '2026-08-01T12:00:00.000Z'

/** A live 3-seat bundle: the owner seated in their own bundle, terms recorded, nobody else yet. */
function seedBundle() {
  H.profiles = [
    {
      id: OWNER,
      display_name: 'Owner',
      handle: 'inv_owner',
      membership_tier: 'crew',
      household_bundle_id: OWNER,
      household_bundle_seats: 3,
      household_bundle_tier: 'crew',
      household_bundle_event_at: STAMP,
    },
    { id: ADA, display_name: 'Ada', handle: 'ada', membership_tier: 'free' },
    { id: BEN, display_name: 'Ben', handle: 'ben', membership_tier: 'free' },
    { id: CLEO, display_name: 'Cleo', handle: 'cleo', membership_tier: 'free' },
  ]
  H.invites = []
  H.notifications = []
  H.written = []
  H.rpcs = []
}

beforeEach(() => {
  H.seq = 0
  seedBundle()
})

describe('the pure seat arithmetic', () => {
  const config = { seats: 4, monthly_cents: 2400, annual_cents: 24000, tier: 'crew' as const }

  it('counts a PENDING invite against the seats left, which is the oversell guard', () => {
    expect(bundleSeatsOpen(config, 1, 0)).toBe(3)
    expect(bundleSeatsOpen(config, 1, 2)).toBe(1)
    // Two seated and two offered fills a four-seat bundle even though nobody has accepted yet.
    expect(bundleSeatsOpen(config, 2, 2)).toBe(0)
  })

  it('never reports a negative seat count', () => {
    expect(bundleSeatsOpen(config, 4, 3)).toBe(0)
  })
})

describe('who may do what', () => {
  it('lets only the bundle owner send', () => {
    expect(
      canSendBundleSeatInvite({ viewerProfileId: OWNER, ownerProfileId: OWNER, toProfileId: ADA, seatsOpen: 2 })
        .allowed,
    ).toBe(true)
    expect(
      canSendBundleSeatInvite({ viewerProfileId: ADA, ownerProfileId: OWNER, toProfileId: BEN, seatsOpen: 2 })
        .allowed,
    ).toBe(false)
    expect(
      canSendBundleSeatInvite({ viewerProfileId: ADA, ownerProfileId: null, toProfileId: BEN, seatsOpen: 2 })
        .allowed,
    ).toBe(false)
  })

  it('refuses a send with no seat left, and a send to yourself', () => {
    expect(
      canSendBundleSeatInvite({ viewerProfileId: OWNER, ownerProfileId: OWNER, toProfileId: ADA, seatsOpen: 0 })
        .allowed,
    ).toBe(false)
    expect(
      canSendBundleSeatInvite({ viewerProfileId: OWNER, ownerProfileId: OWNER, toProfileId: OWNER, seatsOpen: 2 })
        .allowed,
    ).toBe(false)
  })

  it('lets only the bundle owner revoke', () => {
    expect(canRevokeBundleSeatInvite({ viewerProfileId: OWNER, ownerProfileId: OWNER }).allowed).toBe(true)
    expect(canRevokeBundleSeatInvite({ viewerProfileId: ADA, ownerProfileId: OWNER }).allowed).toBe(false)
    expect(canRevokeBundleSeatInvite({ viewerProfileId: null, ownerProfileId: OWNER }).allowed).toBe(false)
  })

  it('lets only the invitee answer, and never the owner on their behalf', () => {
    expect(canAnswerBundleSeatInvite({ viewerProfileId: ADA, toProfileId: ADA }).allowed).toBe(true)
    expect(canAnswerBundleSeatInvite({ viewerProfileId: OWNER, toProfileId: ADA }).allowed).toBe(false)
    expect(canAnswerBundleSeatInvite({ viewerProfileId: BEN, toProfileId: ADA }).allowed).toBe(false)
  })
})

describe('seat accounting cannot be oversold', () => {
  it('refuses the third invite on a three-seat bundle before anyone has accepted', async () => {
    expect((await sendBundleSeatInvite('@ada', OWNER)).ok).toBe(true)
    expect((await sendBundleSeatInvite('ben', OWNER)).ok).toBe(true)

    const third = await sendBundleSeatInvite('cleo', OWNER)
    expect(third.ok).toBe(false)
    expect(third.reason).toMatch(/taken or already offered/i)
    // And nothing was written: the refusal is not a row that later becomes a seat.
    expect(H.invites).toHaveLength(2)
  })

  it('reports the remaining seats through the board, pending invites included', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const board = await loadBundleSeatBoard(OWNER)
    expect(board.ownsBundle).toBe(true)
    expect(board.seats).toBe(3)
    expect(board.seated).toHaveLength(1)
    expect(board.pending).toHaveLength(1)
    // One seat filled (the owner) + one offered = one left, not two.
    expect(board.seatsOpen).toBe(1)
  })

  it('gives the seat back when an invite is withdrawn', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    await sendBundleSeatInvite('ben', OWNER)
    expect((await sendBundleSeatInvite('cleo', OWNER)).ok).toBe(false)

    const invite = H.invites.find((i) => i.to_profile_id === BEN) as { id: string }
    expect((await revokeBundleSeatInvite(invite.id, OWNER)).ok).toBe(true)
    expect((await sendBundleSeatInvite('cleo', OWNER)).ok).toBe(true)
  })

  it('shows no board at all to somebody who owns no bundle', async () => {
    const board = await loadBundleSeatBoard(ADA)
    expect(board.ownsBundle).toBe(false)
    expect(board.seatsOpen).toBe(0)
  })
})

describe('only the owner sends and revokes', () => {
  it('refuses a send from a member who does not own the bundle', async () => {
    const res = await sendBundleSeatInvite('ben', ADA)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/only the member who bought the bundle/i)
    expect(H.invites).toHaveLength(0)
  })

  it('refuses a revoke from anyone but the owner, including the invitee', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }

    expect((await revokeBundleSeatInvite(invite.id, ADA)).ok).toBe(false)
    expect((await revokeBundleSeatInvite(invite.id, BEN)).ok).toBe(false)
    expect(H.invites[0].status).toBe('pending')
    expect((await revokeBundleSeatInvite(invite.id, OWNER)).ok).toBe(true)
    expect(H.invites[0].status).toBe('revoked')
  })
})

describe('only the invitee accepts', () => {
  it('refuses an acceptance from the owner or a bystander, and seats nobody', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }

    expect((await respondToBundleSeatInvite(invite.id, 'accept', OWNER)).ok).toBe(false)
    expect((await respondToBundleSeatInvite(invite.id, 'accept', BEN)).ok).toBe(false)
    expect((H.profiles.find((p) => p.id === ADA) as { household_bundle_id?: string }).household_bundle_id)
      .toBeUndefined()
    expect(H.invites[0].status).toBe('pending')
  })

  it('seats the invitee on their own acceptance, upgrading them to the purchased tier', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }

    expect((await respondToBundleSeatInvite(invite.id, 'accept', ADA)).ok).toBe(true)
    const ada = H.profiles.find((p) => p.id === ADA) as unknown as Profile
    expect(ada.household_bundle_id).toBe(OWNER)
    expect(ada.membership_tier).toBe('crew')
    expect(ada.household_bundle_prior_tier).toBe('free')
  })

  it('lets the invitee decline, which frees the seat and changes their membership not at all', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }

    expect((await respondToBundleSeatInvite(invite.id, 'decline', ADA)).ok).toBe(true)
    const ada = H.profiles.find((p) => p.id === ADA) as unknown as Profile
    expect(ada.household_bundle_id).toBeUndefined()
    expect(ada.membership_tier).toBe('free')
    expect((await loadBundleSeatBoard(OWNER)).seatsOpen).toBe(2)
  })
})

describe('🔴 accepting an invite must not advance household_bundle_event_at', () => {
  it('leaves the Stripe event-ordering stamp exactly where it was', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }
    const before = (H.profiles.find((p) => p.id === OWNER) as unknown as Profile).household_bundle_event_at

    expect((await respondToBundleSeatInvite(invite.id, 'accept', ADA)).ok).toBe(true)

    const after = (H.profiles.find((p) => p.id === OWNER) as unknown as Profile).household_bundle_event_at
    expect(after).toBe(before)
    expect(after).toBe(STAMP)
  })

  it('never writes that column, by any route, on any seat action', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }
    await respondToBundleSeatInvite(invite.id, 'accept', ADA)
    await sendBundleSeatInvite('ben', OWNER)
    const second = H.invites.find((i) => i.to_profile_id === BEN) as { id: string }
    await respondToBundleSeatInvite(second.id, 'decline', BEN)

    // Every column any UPDATE touched, across every table this module writes.
    expect(H.written).not.toContain('household_bundle_event_at')
  })

  it('routes acceptance through accept_bundle_invite_atomic, never the webhook seating RPC', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }
    await respondToBundleSeatInvite(invite.id, 'accept', ADA)

    // apply_bundle_seating_atomic advances the stamp by construction, so reaching for it here
    // would reintroduce the bug no matter how careful the call site was.
    expect(H.rpcs).toContain('accept_bundle_invite_atomic')
    expect(H.rpcs).not.toContain('apply_bundle_seating_atomic')
  })
})

describe('accepting twice seats once', () => {
  it('refuses the second acceptance and leaves the recorded prior tier alone', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    const invite = H.invites[0] as { id: string }

    expect((await respondToBundleSeatInvite(invite.id, 'accept', ADA)).ok).toBe(true)
    const second = await respondToBundleSeatInvite(invite.id, 'accept', ADA)
    expect(second.ok).toBe(false)
    expect(second.reason).toMatch(/already been answered/i)

    const ada = H.profiles.find((p) => p.id === ADA) as unknown as Profile
    expect(ada.household_bundle_id).toBe(OWNER)
    // If the second run had re-recorded it, this would now be 'crew' and leaving the bundle
    // would hand out a paid tier for free.
    expect(ada.household_bundle_prior_tier).toBe('free')
    expect((H.profiles as unknown as Profile[]).filter((p) => p.household_bundle_id === OWNER)).toHaveLength(2)
  })
})

describe('the invitee is told', () => {
  it('writes a notification pointing at the plan settings', async () => {
    await sendBundleSeatInvite('ada', OWNER)
    expect(H.notifications).toHaveLength(1)
    expect(H.notifications[0]).toMatchObject({
      recipient_id: ADA,
      actor_id: OWNER,
      type: 'bundle_seat_invite',
      reference_type: 'bundle_invite',
    })
    expect(String(H.notifications[0].body)).toContain('Household bundle')
  })

  it('does not send an invite to a handle that names nobody', async () => {
    const res = await sendBundleSeatInvite('nobody-here', OWNER)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/could not find that member/i)
    expect(H.invites).toHaveLength(0)
    expect(H.notifications).toHaveLength(0)
  })
})
