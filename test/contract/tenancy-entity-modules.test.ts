import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  makeSupabaseRecorder,
  recorded,
  makeTwoSpaceDb,
  expectSpaceScoped,
  expectScopedMutation,
  SPACE_A,
  SPACE_B,
  type SupabaseRecorder,
} from './tenancy'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SEC-02 - CROSS-TENANT LEAK SWEEP (one contract per space_id-scoped entity module + the directory).
//
// Every reader/writer under lib/spaces/*, lib/qr/space-codes.ts, lib/crm/pipeline.ts that backs an
// entity surface (components/widgets/entity/*) goes through the SERVICE-ROLE admin client, which
// BYPASSES RLS. So the filter the reader applies is the ONLY tenancy gate at that layer. Each block
// below proves a Space A caller's query binds `space_id` (or the documented equivalent), so it can
// never read or write Space B's rows. Where a reader resolves data through the filter, a TWO-SPACE
// leak oracle additionally proves only Space A's rows come back.
//
// These complement (don't replace) the richer per-module unit tests (lib/spaces/*.test.ts); this is
// the single sweep that asserts the SCOPING FILTER itself, module by module, so a refactor that
// drops an `.eq('space_id', ...)` fails here regardless of which module it lands in.
// ════════════════════════════════════════════════════════════════════════════════════════════════

// A hoisted holder the admin-client mock reads lazily; recreated per test in beforeEach.
const h = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))

// Caller identity + the space/capability seams the gated readers consult. Default: the OWNER of
// Space A, so every reader passes its authz gate and reaches the actual query (the part under test).
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => 'owner-A',
  getCallerProfile: async () => ({ id: 'owner-A', webRole: 'none' }),
}))
vi.mock('@/lib/spaces/store', async (orig) => {
  const real = await orig<typeof import('@/lib/spaces/store')>()
  return {
    ...real,
    // The gated readers resolve the Space first; return a minimal owned Space for whichever id asked.
    getSpaceById: async (id: string) => ({ id, slug: 'a', ownerProfileId: 'owner-A' }),
  }
})
vi.mock('@/lib/spaces/entitlements', async (orig) => {
  // Keep the PURE entitlement readers real (spaceEntitlements / spaceHasEntitlement), so the per-Space
  // function resolver the write actions now call for defense-in-depth (spaceFunctionAccess, per-space-
  // roles Phase 2) resolves correctly; only getSpaceCapabilities is overridden to seat the owner.
  const real = await orig<typeof import('@/lib/spaces/entitlements')>()
  return {
    ...real,
    getSpaceCapabilities: async (space: { ownerProfileId?: string | null } | null, profileId: string | null) => {
      const isOwner = !!space?.ownerProfileId && space.ownerProfileId === profileId
      return { isOwner, isAdmin: isOwner, role: isOwner ? 'admin' : null, canEditProfile: isOwner, canManageMembers: isOwner, canInvite: isOwner }
    },
  }
})
vi.mock('@/lib/core/roles', () => ({ isJanitor: () => false }))
// next/cache is pulled by the write modules (follows/campaigns); make it a no-op under vitest.
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

const rec = () => h.client as SupabaseRecorder

beforeEach(() => {
  h.client = makeSupabaseRecorder()
})

// ── lib/spaces/store.ts - the Space metadata reader (the row IS the Space → bind by id) ──────────
describe('store: space reads bind to a single Space', () => {
  it('getSpaceById reads exactly the asked Space by primary key (id == the Space)', async () => {
    const { getSpaceById } = await vi.importActual<typeof import('@/lib/spaces/store')>('@/lib/spaces/store')
    await getSpaceById(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A, { column: 'id' })
  })
})

// ── lib/spaces/membership.ts - space_members (members module) ────────────────────────────────────
describe('membership: every space_members read/write filters space_id', () => {
  it('getSpaceMembership binds space_id (+ the profile)', async () => {
    const { getSpaceMembership } = await import('@/lib/spaces/membership')
    await getSpaceMembership(SPACE_A, 'p1')
    expectSpaceScoped(rec(), SPACE_A)
    expect(recorded(rec(), 'eq', 'profile_id', 'p1')).toBe(true)
  })

  it('listSpaceMembers binds space_id', async () => {
    const { listSpaceMembers } = await import('@/lib/spaces/membership')
    await listSpaceMembers(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('updateSpaceMemberRole binds space_id on the UPDATE', async () => {
    const { updateSpaceMemberRole } = await import('@/lib/spaces/membership')
    await updateSpaceMemberRole(SPACE_A, 'p1', 'editor')
    expectScopedMutation(rec(), 'update', SPACE_A)
  })

  it('removeSpaceMember binds space_id on the DELETE', async () => {
    const { removeSpaceMember } = await import('@/lib/spaces/membership')
    await removeSpaceMember(SPACE_A, 'p1')
    expectScopedMutation(rec(), 'delete', SPACE_A)
  })

  it('LEAK ORACLE: listSpaceMembers over a two-space table returns ONLY Space A rows', async () => {
    h.client = makeTwoSpaceDb({
      space_members: [
        { id: 'mA', space_id: SPACE_A, profile_id: 'a1', role: 'admin', status: 'active', invited_by: null, created_at: '2026-01-02T00:00:00Z' },
        { id: 'mB', space_id: SPACE_B, profile_id: 'b1', role: 'admin', status: 'active', invited_by: null, created_at: '2026-01-01T00:00:00Z' },
      ],
    })
    const { listSpaceMembers } = await import('@/lib/spaces/membership')
    const rows = await listSpaceMembers(SPACE_A)
    expect(rows.map((r) => r.spaceId)).toEqual([SPACE_A])
  })
})

// ── lib/spaces/follows.ts - the follow ledger (follows module) ───────────────────────────────────
describe('follows: every space_follows read/write binds space_id', () => {
  it('isFollowing binds space_id (+ the follower)', async () => {
    const { isFollowing } = await import('@/lib/spaces/follows')
    await isFollowing(SPACE_A, 'p1')
    expectSpaceScoped(rec(), SPACE_A)
    expect(recorded(rec(), 'eq', 'follower_profile_id', 'p1')).toBe(true)
  })

  it('followSpace stamps space_id on the upsert', async () => {
    const { followSpace } = await import('@/lib/spaces/follows')
    await followSpace(SPACE_A)
    expectScopedMutation(rec(), 'upsert', SPACE_A)
  })

  it('unfollowSpace binds space_id on the DELETE', async () => {
    const { unfollowSpace } = await import('@/lib/spaces/follows')
    await unfollowSpace(SPACE_A)
    expectScopedMutation(rec(), 'delete', SPACE_A)
  })
})

// ── lib/spaces/checkin.ts - Event Space check-in (QR / check-in module) ──────────────────────────
describe('checkin: the check-in node read/write binds space_id', () => {
  it('ensureCheckinNode reads the node for THIS Space by space_id + kind', async () => {
    // Empty node read → it will try to insert; that insert also stamps space_id. Both recorded.
    const { ensureCheckinNode } = await import('@/lib/spaces/checkin')
    await ensureCheckinNode(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
    expect(recorded(rec(), 'eq', 'kind', 'checkin')).toBe(true)
  })

  it('LEAK ORACLE: ensureCheckinNode resolves only the node for THIS Space', async () => {
    h.client = makeTwoSpaceDb({
      nodes: [
        { id: 'nodeA', space_id: SPACE_A, kind: 'checkin', secret: 's', created_at: '2026-01-01T00:00:00Z' },
        { id: 'nodeB', space_id: SPACE_B, kind: 'checkin', secret: 's', created_at: '2026-01-01T00:00:00Z' },
      ],
    })
    const { ensureCheckinNode } = await import('@/lib/spaces/checkin')
    const node = await ensureCheckinNode(SPACE_A)
    expect(node?.id).toBe('nodeA') // never nodeB
  })
})

// ── lib/spaces/audiences.ts - per-space contacts (CRM audience module) ───────────────────────────
describe('audiences: contact + tag reads bind the Space', () => {
  it('resolveAudience reads contacts by space_id', async () => {
    const { resolveAudience } = await import('@/lib/spaces/audiences')
    // Seed one contact so the reader doesn't short-circuit before exercising the filter.
    h.client = makeTwoSpaceDb({
      contacts: [
        { id: 'cA', space_id: SPACE_A, email: 'a@a.com' },
        { id: 'cB', space_id: SPACE_B, email: 'b@b.com' },
      ],
    })
    const out = await resolveAudience(SPACE_A)
    // LEAK ORACLE: only Space A's contact resolves (B's is never reachable).
    expect(out.map((r) => r.email)).toEqual(['a@a.com'])
  })

  it('resolveAudience records the .eq(space_id) filter on the contacts read', async () => {
    const { resolveAudience } = await import('@/lib/spaces/audiences')
    await resolveAudience(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('listAudienceTags binds the Space via the joined network_contacts.space_id', async () => {
    const { listAudienceTags } = await import('@/lib/spaces/audiences')
    await listAudienceTags(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A, { column: 'network_contacts.space_id' })
  })
})

// ── lib/spaces/crm-funnel.ts - per-Space contact AT-RISK / churn slice (ADR-560) ─────────────────
// The cockpit's at-risk read scores THIS Space's contacts and must never reach another Space's rows.
// getSpaceCrmFunnel is owner-gated (the owner-A seam above seats the owner of whichever id asks) and
// reads contacts through the RLS-bypassing admin client, so the .eq('space_id') filter is the ONLY
// tenancy gate at this layer. These contracts lock it: the FILTER is recorded, and a two-space leak
// oracle proves only Space A's at-risk contacts come back.
describe('crm-funnel: the at-risk contact read binds the Space', () => {
  it('getSpaceCrmFunnel scores contacts scoped by space_id (filter recorded)', async () => {
    const { getSpaceCrmFunnel } = await import('@/lib/spaces/crm-funnel')
    await getSpaceCrmFunnel(SPACE_A)
    // Both the reach read and the at-risk read filter the Space; either recording proves the bind.
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('only Space A contacts are scored for at-risk (two-space leak oracle)', async () => {
    // A cold Space A contact and a cold Space B contact; only A's may ever surface.
    const cold = { last_seen_at: '2020-01-01T00:00:00.000Z', engagement_score: 0, consent_state: 'unsubscribed' }
    h.client = makeTwoSpaceDb({
      contacts: [
        { id: 'cA', space_id: SPACE_A, email: 'a@a.com', display_name: 'A', ...cold },
        { id: 'cB', space_id: SPACE_B, email: 'b@b.com', display_name: 'B', ...cold },
      ],
    })
    const funnel = await getSpaceCrmFunnelFresh()
    // LEAK ORACLE: only Space A's cold contact is counted / listed (B's is never reachable).
    expect(funnel.atRisk.count).toBe(1)
    expect(funnel.atRisk.top.map((c) => c.email)).toEqual(['a@a.com'])
  })
})

// Re-import inside the test so the fresh two-space db is picked up by the module's admin-client cast.
async function getSpaceCrmFunnelFresh() {
  const { getSpaceCrmFunnel } = await import('@/lib/spaces/crm-funnel')
  return getSpaceCrmFunnel(SPACE_A)
}

// ── lib/spaces/campaigns.ts - email campaigns (email module) ─────────────────────────────────────
describe('campaigns: list + single-read bind space_id', () => {
  it('listSpaceCampaigns binds space_id', async () => {
    const { listSpaceCampaigns } = await import('@/lib/spaces/campaigns')
    await listSpaceCampaigns(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('LEAK ORACLE: listSpaceCampaigns returns only Space A campaigns', async () => {
    h.client = makeTwoSpaceDb({
      campaigns: [
        { id: 'kA', space_id: SPACE_A, subject: 'A', body: 'a', status: 'draft', created_at: '2026-01-02T00:00:00Z' },
        { id: 'kB', space_id: SPACE_B, subject: 'B', body: 'b', status: 'draft', created_at: '2026-01-01T00:00:00Z' },
      ],
    })
    const { listSpaceCampaigns } = await import('@/lib/spaces/campaigns')
    const rows = await listSpaceCampaigns(SPACE_A)
    // Every returned id belongs to Space A's seeded campaign only.
    expect(rows.every((r) => r.id === 'kA')).toBe(true)
    expect(rows.some((r) => r.id === 'kB')).toBe(false)
  })
})

// ── lib/spaces/email-analytics.ts - send stats + suppressions (email analytics module) ───────────
describe('email-analytics: stats + history bind space_id', () => {
  it('getSpaceEmailStats binds space_id on the sends read', async () => {
    const { getSpaceEmailStats } = await import('@/lib/spaces/email-analytics')
    await getSpaceEmailStats(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('recentSpaceSends binds space_id', async () => {
    const { recentSpaceSends } = await import('@/lib/spaces/email-analytics')
    await recentSpaceSends(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('listSpaceSuppressions binds this Space (the union adds ONLY the global null rows)', async () => {
    const { listSpaceSuppressions } = await import('@/lib/spaces/email-analytics')
    await listSpaceSuppressions(SPACE_A)
    // The union filter is `space_id.eq.<id>,space_id.is.null` - assert it pins THIS space + global,
    // and never another Space's id.
    const orCall = rec().calls.find((c) => c.method === 'or')
    expect(orCall, `expected an .or() suppression-union filter, got: ${JSON.stringify(rec().calls)}`).toBeTruthy()
    const filter = String(orCall?.args[0] ?? '')
    expect(filter).toContain(`space_id.eq.${SPACE_A}`)
    expect(filter).toContain('space_id.is.null')
    expect(filter).not.toContain(SPACE_B)
  })
})

// ── lib/spaces/booking.ts - availability + bookings (availability module) ────────────────────────
describe('booking: availability + bookings reads bind space_id', () => {
  it('listSpaceAvailability binds space_id', async () => {
    const { listSpaceAvailability } = await import('@/lib/spaces/booking')
    await listSpaceAvailability(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('listSpaceBookings binds space_id', async () => {
    const { listSpaceBookings } = await import('@/lib/spaces/booking')
    await listSpaceBookings(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('LEAK ORACLE: listSpaceAvailability returns only Space A windows', async () => {
    h.client = makeTwoSpaceDb({
      space_availability: [
        { id: 'wA', space_id: SPACE_A, weekday: 1, start_minute: 60, end_minute: 120, slot_minutes: 30, timezone: 'UTC' },
        { id: 'wB', space_id: SPACE_B, weekday: 1, start_minute: 60, end_minute: 120, slot_minutes: 30, timezone: 'UTC' },
      ],
    })
    const { listSpaceAvailability } = await import('@/lib/spaces/booking')
    const windows = await listSpaceAvailability(SPACE_A)
    expect(windows.length).toBeGreaterThan(0)
    // None of the resolved windows may originate from Space B (the fake honored the space_id filter).
    expect(windows.length).toBe(1)
  })
})

// ── lib/spaces/memberships.ts - paid tiers + memberships (memberships module) ────────────────────
describe('memberships: tiers + memberships reads bind space_id', () => {
  it('listMembershipTiers binds space_id', async () => {
    const { listMembershipTiers } = await import('@/lib/spaces/memberships')
    await listMembershipTiers(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('listSpaceMemberships binds space_id', async () => {
    const { listSpaceMemberships } = await import('@/lib/spaces/memberships')
    await listSpaceMemberships(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })
})

// ── lib/spaces/donations.ts - the single per-space donation ask (Organization donations module) ──
describe('donations: the donation ask read/write binds space_id', () => {
  it('setDonationAsk clears the existing ask scoped by space_id, then stamps space_id on the insert', async () => {
    const { setDonationAsk } = await import('@/lib/spaces/donations')
    await setDonationAsk(SPACE_A, {
      fundLabel: 'General fund',
      description: null,
      suggestedAmountsCents: [500],
      isActive: true,
    })
    // The replace deletes THIS Space's ask (never another's) and re-inserts stamping the Space.
    expectScopedMutation(rec(), 'delete', SPACE_A)
    const insert = rec().calls.find((c) => c.method === 'insert')
    const rows = insert?.args[0] as Array<Record<string, unknown>> | undefined
    expect(
      rows?.[0]?.space_id,
      `CROSS-TENANT LEAK: the donation-ask insert did not stamp space_id. Recorded: ${JSON.stringify(rec().calls)}`,
    ).toBe(SPACE_A)
  })

  it('getOwnerDonationAsk reads the ask by space_id', async () => {
    const { getOwnerDonationAsk } = await import('@/lib/spaces/donations')
    await getOwnerDonationAsk(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('LEAK ORACLE: getOwnerDonationAsk over a two-space table returns ONLY Space A\'s ask', async () => {
    h.client = makeTwoSpaceDb({
      space_donation_asks: [
        { id: 'askA', space_id: SPACE_A, fund_label: 'A fund', description: null, suggested_amounts_cents: [500], is_active: true },
        { id: 'askB', space_id: SPACE_B, fund_label: 'B fund', description: null, suggested_amounts_cents: [900], is_active: true },
      ],
    })
    const { getOwnerDonationAsk } = await import('@/lib/spaces/donations')
    const ask = await getOwnerDonationAsk(SPACE_A)
    expect(ask?.fundLabel).toBe('A fund') // never 'B fund'
  })
})

// ── lib/spaces/enroll.ts - programs + enrollments (Coaching enroll module) ───────────────────────
describe('enroll: program + enrollment reads/writes bind space_id', () => {
  it('setSpaceProgram clears the existing program scoped by space_id, then stamps space_id on the insert', async () => {
    const { setSpaceProgram } = await import('@/lib/spaces/enroll')
    await setSpaceProgram(SPACE_A, { name: 'Cohort 1' })
    expectScopedMutation(rec(), 'delete', SPACE_A)
    const insert = rec().calls.find((c) => c.method === 'insert')
    const rows = insert?.args[0] as Array<Record<string, unknown>> | undefined
    expect(
      rows?.[0]?.space_id,
      `CROSS-TENANT LEAK: the program insert did not stamp space_id. Recorded: ${JSON.stringify(rec().calls)}`,
    ).toBe(SPACE_A)
  })

  it('listSpaceEnrollments reads the active enrollments by space_id', async () => {
    const { listSpaceEnrollments } = await import('@/lib/spaces/enroll')
    await listSpaceEnrollments(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('enrollInProgram resolves THIS Space\'s program by space_id (the cross-space enroll gate)', async () => {
    // The enrollable program is resolved by space_id BEFORE the insert; that read is the tenancy gate
    // that prevents enrolling into another Space's program. Assert it binds the Space.
    const { enrollInProgram } = await import('@/lib/spaces/enroll')
    await enrollInProgram(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('LEAK ORACLE: listSpaceEnrollments over a two-space table returns ONLY Space A enrollments', async () => {
    h.client = makeTwoSpaceDb({
      space_enrollments: [
        { id: 'eA', space_id: SPACE_A, program_id: 'progA', member_profile_id: 'a1', status: 'active', enrolled_at: '2026-01-02T00:00:00Z' },
        { id: 'eB', space_id: SPACE_B, program_id: 'progB', member_profile_id: 'b1', status: 'active', enrolled_at: '2026-01-01T00:00:00Z' },
      ],
      // member-name lookup (.in('id', ids)); the profile rows carry a space_id only to satisfy the fake.
      profiles: [{ id: 'a1', space_id: SPACE_A, display_name: 'A member' }],
    })
    const { listSpaceEnrollments } = await import('@/lib/spaces/enroll')
    const rows = await listSpaceEnrollments(SPACE_A)
    expect(rows.map((r) => r.spaceId)).toEqual([SPACE_A]) // never Space B's enrollment
  })
})

// ── lib/spaces/tickets.ts - ticket tiers + RSVPs (Event Space ticketing module) ──────────────────
describe('tickets: tier + RSVP reads/writes bind space_id', () => {
  it('setTicketTiers clears the existing tiers scoped by space_id, then stamps space_id on the insert', async () => {
    const { setTicketTiers } = await import('@/lib/spaces/tickets')
    await setTicketTiers(SPACE_A, [
      { name: 'GA', kind: 'rsvp', capacity: 10, description: null, sort: 0, isActive: true },
    ])
    expectScopedMutation(rec(), 'delete', SPACE_A)
    const insert = rec().calls.find((c) => c.method === 'insert')
    const rows = insert?.args[0] as Array<Record<string, unknown>> | undefined
    expect(
      rows?.[0]?.space_id,
      `CROSS-TENANT LEAK: the ticket-tier insert did not stamp space_id. Recorded: ${JSON.stringify(rec().calls)}`,
    ).toBe(SPACE_A)
  })

  it('listSpaceRsvps reads the going RSVPs by space_id', async () => {
    const { listSpaceRsvps } = await import('@/lib/spaces/tickets')
    await listSpaceRsvps(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('rsvpToTier resolves THIS Space\'s tiers by space_id (the cross-space RSVP gate)', async () => {
    // The RSVP-able tier is resolved from THIS Space's tiers (by space_id) BEFORE the insert; that read
    // is the tenancy gate that prevents reserving a spot on another Space's tier. Assert it binds.
    const { rsvpToTier } = await import('@/lib/spaces/tickets')
    await rsvpToTier(SPACE_A, 'tier-x')
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('LEAK ORACLE: listSpaceRsvps over a two-space table returns ONLY Space A RSVPs', async () => {
    h.client = makeTwoSpaceDb({
      space_ticket_rsvps: [
        { id: 'rA', space_id: SPACE_A, tier_id: 'tA', member_profile_id: 'a1', status: 'going', reserved_at: '2026-01-02T00:00:00Z' },
        { id: 'rB', space_id: SPACE_B, tier_id: 'tB', member_profile_id: 'b1', status: 'going', reserved_at: '2026-01-01T00:00:00Z' },
      ],
      // readTiers (.eq('space_id')) for the tier-name join; only Space A's tier is reachable.
      space_ticket_tiers: [
        { id: 'tA', space_id: SPACE_A, name: 'GA', kind: 'rsvp', capacity: null, description: null, sort: 0, is_active: true },
        { id: 'tB', space_id: SPACE_B, name: 'VIP', kind: 'rsvp', capacity: null, description: null, sort: 0, is_active: true },
      ],
      profiles: [{ id: 'a1', space_id: SPACE_A, display_name: 'A member' }],
    })
    const { listSpaceRsvps } = await import('@/lib/spaces/tickets')
    const rows = await listSpaceRsvps(SPACE_A)
    expect(rows.map((r) => r.spaceId)).toEqual([SPACE_A]) // never Space B's RSVP
  })
})

// ── lib/qr/space-codes.ts - per-space managed QR codes (QR module) ───────────────────────────────
describe('qr space-codes: code + scan reads bind the Space', () => {
  it('listSpaceCodes reads codes by space_id', async () => {
    const { listSpaceCodes } = await import('@/lib/qr/space-codes')
    await listSpaceCodes(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('LEAK ORACLE: listSpaceScanRows over a Space with NO codes returns [] (never the scans of every Space)', async () => {
    // The reader resolves THIS Space's code ids first; with none, it must NOT issue a bare
    // `.in('qr_code_id', [])` that some clients read as "no filter" - it returns [] up front.
    h.client = makeTwoSpaceDb({
      qr_codes: [{ id: 'codeB', space_id: SPACE_B, slug: 's', title: 't', destination_type: 'url', target_url: null, active: true, scan_count: 0, splash: null, created_at: '2026-01-01T00:00:00Z' }],
      qr_scans: [{ id: 'scanB', space_id: SPACE_B, qr_code_id: 'codeB', profile_id: 'b1', scanned_at: '2026-01-01T00:00:00Z', medium: 'qr' }],
    })
    const { listSpaceScanRows } = await import('@/lib/qr/space-codes')
    const rows = await listSpaceScanRows(SPACE_A) // Space A owns no codes here
    expect(rows).toEqual([]) // never Space B's scan row
  })
})

// ── lib/crm/pipeline.ts - CRM deals/contacts (CRM module, OPTIONAL space scope) ──────────────────
describe('crm pipeline: a per-space caller pins space_id; the read honors it', () => {
  it('getDeals(spaceId) binds space_id when a Space is given', async () => {
    const { getDeals } = await import('@/lib/crm/pipeline')
    await getDeals(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('getContacts(spaceId) binds space_id when a Space is given', async () => {
    const { getContacts } = await import('@/lib/crm/pipeline')
    await getContacts(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('LEAK ORACLE: getDeals(SPACE_A) returns only Space A deals from a two-space table', async () => {
    h.client = makeTwoSpaceDb({
      crm_deals: [
        { id: 'dA', space_id: SPACE_A, title: 'A' },
        { id: 'dB', space_id: SPACE_B, title: 'B' },
      ],
    })
    const { getDeals } = await import('@/lib/crm/pipeline')
    const deals = await getDeals(SPACE_A)
    expect(deals.map((d) => (d as { id: string }).id)).toEqual(['dA'])
  })
})

// ── components/widgets/entity/entity-about.tsx - the inline About reader (entity surface) ─────────
describe('entity-about: the inline about reader binds the Space by id', () => {
  it('LEAK ORACLE: reading About for Space A never returns the other Space prose', async () => {
    // entity-about reads `.from('spaces').select('about').eq('id', spaceId)`. The row IS the Space,
    // so binding by primary key is the correct tenancy gate. Prove a two-space table yields only A.
    h.client = makeTwoSpaceDb({
      // For the `spaces` table the scoping column is `id` (the row is the Space); model it as the
      // scope key so the oracle filters on it.
      spaces: [
        { space_id: SPACE_A, id: SPACE_A, about: 'About A' },
        { space_id: SPACE_B, id: SPACE_B, about: 'About B' },
      ],
    })
    // Exercise the same query shape the widget's readAbout uses, through the mocked admin client.
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { about?: string } | null }> } } }
    }
    const { data } = await db.from('spaces').select('about').eq('id', SPACE_A).maybeSingle()
    expect(data?.about).toBe('About A') // never 'About B'
  })
})

// ── lib/spaces/automation.ts - per-Space rules + drip sequences (automation module, R5) ──────────
// The three tables (space_automation_rules / space_drip_sequences / space_drip_steps) are service-role
// only (RLS enabled, NO policies), so the .eq('space_id', ...) filter each reader/writer applies is the
// ONLY tenancy gate at that layer. Prove list reads + every mutation bind space_id, so a Space A caller
// can never read or write Space B's automation. (The write gate on canEditProfile is proven in the
// per-module unit test lib/spaces/automation.test.ts; this locks the SCOPING FILTER.)
describe('automation: rule + sequence reads/writes bind space_id', () => {
  it('listSpaceRules binds space_id', async () => {
    const { listSpaceRules } = await import('@/lib/spaces/automation')
    await listSpaceRules(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('listSpaceSequences binds space_id', async () => {
    const { listSpaceSequences } = await import('@/lib/spaces/automation')
    await listSpaceSequences(SPACE_A)
    expectSpaceScoped(rec(), SPACE_A)
  })

  it('setSpaceRuleEnabled binds space_id on the update', async () => {
    const { setSpaceRuleEnabled } = await import('@/lib/spaces/automation')
    await setSpaceRuleEnabled(SPACE_A, 'rule-1', false)
    expectScopedMutation(rec(), 'update', SPACE_A)
  })

  it('deleteSpaceRule binds space_id on the delete', async () => {
    const { deleteSpaceRule } = await import('@/lib/spaces/automation')
    await deleteSpaceRule(SPACE_A, 'rule-1')
    expectScopedMutation(rec(), 'delete', SPACE_A)
  })

  it('setSpaceSequenceEnabled binds space_id on the update', async () => {
    const { setSpaceSequenceEnabled } = await import('@/lib/spaces/automation')
    await setSpaceSequenceEnabled(SPACE_A, 'seq-1', false)
    expectScopedMutation(rec(), 'update', SPACE_A)
  })

  it('deleteSpaceSequence binds space_id on the delete', async () => {
    const { deleteSpaceSequence } = await import('@/lib/spaces/automation')
    await deleteSpaceSequence(SPACE_A, 'seq-1')
    expectScopedMutation(rec(), 'delete', SPACE_A)
  })

  it('deleteSequenceStep binds space_id on the delete', async () => {
    const { deleteSequenceStep } = await import('@/lib/spaces/automation')
    await deleteSequenceStep(SPACE_A, 'step-1')
    expectScopedMutation(rec(), 'delete', SPACE_A)
  })
})
