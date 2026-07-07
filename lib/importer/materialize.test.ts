import { describe, it, expect, beforeEach, vi } from 'vitest'

// SEEDING contract (P0, docs/BUSINESS-IMPORTER.md §8 DoD). materializeBusiness provisions a
// draft/unlisted Space, writes profileData + profileLayout + accent, seeds availability / faqs /
// events bound to the space_id, and is idempotent on re-run. The DB is a small in-memory mock of the
// admin client so this runs with ZERO real DB and ZERO AI, exactly like the webhook/route tests.
//
// This mock stands in for the ONE integration seam the spec flags: a live-DB round-trip (a real
// Space renders at /spaces/[slug]). The mock asserts the exact table writes; a follow-up db-test
// (test:rls harness) would prove the render end to end.

// A tiny in-memory store keyed by table. Rows carry a synthetic id.
const H = vi.hoisted(() => {
  interface Row {
    id: string
    [k: string]: unknown
  }
  const tables: Record<string, Row[]> = {
    spaces: [],
    space_members: [],
    space_availability: [],
    space_faqs: [],
    events: [],
    profiles: [],
  }
  let seq = 0
  const nextId = () => `id-${++seq}`

  function reset() {
    for (const k of Object.keys(tables)) tables[k] = []
    seq = 0
    // Seed a root space so loadRootSpaceId / rootEntityId resolve.
    tables.spaces.push({ id: 'root-space', type: 'root', entity_id: 'root-entity', slug: 'root' })
    // Seed the demo owner profile so the Spotlight dressing can update meta.
    tables.profiles.push({ id: 'owner-1', meta: {} })
  }

  return { tables, nextId, reset }
})

// A chainable query builder over one table. Supports the exact call shapes materialize.ts uses.
function makeBuilder(table: string) {
  const rows = () => H.tables[table]
  const filters: Array<{ col: string; val: string }> = []
  const applyFilters = () =>
    rows().filter((r) => filters.every((f) => (r as Record<string, unknown>)[f.col] === f.val))

  const builder: Record<string, unknown> = {
    insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
      const list = Array.isArray(payload) ? payload : [payload]
      const inserted = list.map((p) => {
        const row = { id: H.nextId(), ...p }
        rows().push(row as { id: string })
        return row
      })
      // Support BOTH `await insert(...)` and `insert(...).select().maybeSingle()`.
      const result = { data: inserted, error: null }
      const thenable = {
        select: () => ({
          maybeSingle: async () => ({ data: inserted[0] ?? null, error: null }),
          single: async () => ({ data: inserted[0] ?? null, error: null }),
        }),
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
      }
      return thenable
    },
    update(patch: Record<string, unknown>) {
      return {
        eq: async (col: string, val: string) => {
          for (const r of rows()) {
            if ((r as Record<string, unknown>)[col] === val) Object.assign(r, patch)
          }
          return { error: null }
        },
      }
    },
    delete() {
      return {
        eq: async (col: string, val: string) => {
          H.tables[table] = rows().filter((r) => (r as Record<string, unknown>)[col] !== val)
          return { error: null }
        },
      }
    },
    select() {
      const chain: Record<string, unknown> = {
        eq(col: string, val: string) {
          filters.push({ col, val })
          return chain
        },
        maybeSingle: async () => ({ data: applyFilters()[0] ?? null, error: null }),
        single: async () => ({ data: applyFilters()[0] ?? null, error: null }),
      }
      return chain
    },
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => makeBuilder(t),
  }),
}))

// getSpaceById / loadRootSpaceId read the mocked spaces table and map to the Space shape the
// materializer needs (id / ownerProfileId / preferences).
vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => 'root-space',
  getSpaceById: async (id: string) => {
    const row = H.tables.spaces.find((r) => r.id === id)
    if (!row) return null
    return {
      id: row.id as string,
      slug: row.slug as string,
      ownerProfileId: (row.owner_profile_id as string) ?? null,
      preferences: (row.preferences as unknown) ?? {},
    }
  },
}))

// addSpaceMember writes a space_members row (bound to space_id), like the real store.
vi.mock('@/lib/spaces/membership', () => ({
  addSpaceMember: async (input: { spaceId: string; profileId: string; role?: string; status?: string }) => {
    H.tables.space_members.push({
      id: H.nextId(),
      space_id: input.spaceId,
      profile_id: input.profileId,
      role: input.role ?? 'viewer',
      status: input.status ?? 'active',
    })
    return { id: 'membership' }
  },
}))

// The business_intake store is mocked so applyIntake reads a controllable row; materializeBusiness
// still runs FOR REAL against the in-memory admin harness above, so we assert the true DB writes.
const intakeStore = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, applied: [] as string[] }))
vi.mock('./store', () => ({
  getIntake: async () => intakeStore.row,
  markApplied: async (id: string) => {
    intakeStore.applied.push(id)
    return true
  },
  setStatus: async () => true,
}))

import { materializeBusiness, applyIntake } from './materialize'
import { wellnessStudioFixture } from './fixtures/wellness-studio'

beforeEach(() => {
  H.reset()
})

describe('materializeBusiness — create', () => {
  it('provisions a draft/unlisted business Space and seats the owner', async () => {
    const res = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' }, { verificationPolicy: 'allow' })
    expect(res.ok).toBe(true)
    expect(res.seeded?.createdSpace).toBe(true)

    const space = H.tables.spaces.find((s) => s.id === res.spaceId)
    expect(space).toBeTruthy()
    expect(space!.type).toBe('business')
    expect(space!.slug).toBe('still-water-wellness')
    expect(space!.status).toBe('active')
    expect(space!.visibility).toBe('private') // demo posture: unlisted/draft
    expect(space!.owner_profile_id).toBe('owner-1')
    expect(space!.brand_accent).toBe('--color-signal')
    expect((space!.preferences as Record<string, unknown>).isDemo).toBe(true)
    // websitePublished stays UNSET (draft) until an operator flips live.
    expect((space!.preferences as Record<string, unknown>).websitePublished).toBeUndefined()

    // Owner is seated as an admin member, bound to the new space.
    const seat = H.tables.space_members.find((m) => m.space_id === res.spaceId)
    expect(seat).toMatchObject({ profile_id: 'owner-1', role: 'admin', status: 'active' })
  })

  it('writes profileData (contact/hours/socials/offerings/rating) and a profileLayout', async () => {
    const res = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' }, { verificationPolicy: 'allow' })
    const space = H.tables.spaces.find((s) => s.id === res.spaceId)!
    const prefs = space.preferences as Record<string, unknown>
    const profileData = prefs.profileData as Record<string, unknown>
    expect(profileData.phone).toBe('(503) 555-0142')
    expect(profileData.hours).toContain('Mon to Fri')
    expect((profileData.offerings as unknown[]).length).toBe(3)
    expect(profileData.rating).toBe('4.9')

    const layout = prefs.profileLayout as { rows?: Array<{ cells: string[][] }>; content?: Record<string, unknown> }
    expect(layout.rows?.length).toBeGreaterThan(0)
    const placed = (layout.rows ?? []).flatMap((r) => r.cells.flat())
    expect(placed).toContain('photoHero')
    expect(placed).toContain('offerings')
    expect(placed).toContain('contact')
    expect(layout.content?.photoHero).toBeTruthy()
  })

  it('seeds availability windows, faqs, and events bound to the space_id', async () => {
    const res = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' }, { verificationPolicy: 'allow' })
    expect(res.seeded?.availabilityWindows).toBe(2)
    expect(res.seeded?.faqs).toBe(2)
    expect(res.seeded?.events).toBe(1)

    // Every record is stamped with the target space_id (tenancy).
    expect(H.tables.space_availability.every((r) => r.space_id === res.spaceId)).toBe(true)
    expect(H.tables.space_faqs.every((r) => r.space_id === res.spaceId)).toBe(true)
    const ev = H.tables.events.find((e) => e.space_id === res.spaceId)!
    expect(ev).toBeTruthy()
    expect(ev.host_id).toBe('owner-1')
    expect(ev.scope_type).toBe('standalone')
    expect(ev.scope_id).toBe('owner-1') // self-reference satisfies NOT NULL scope_id
    expect(ev.status).toBe('published')
  })

  it('fails cleanly on a draft with no usable name', async () => {
    const res = await materializeBusiness({ name: '', type: 'business' }, { kind: 'create', ownerProfileId: 'owner-1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/name or slug/i)
    expect(H.tables.spaces.filter((s) => s.type === 'business')).toHaveLength(0)
  })

  it('appends a numeric suffix when the slug is already taken', async () => {
    const first = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' }, { verificationPolicy: 'allow' })
    const second = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' }, { verificationPolicy: 'allow' })
    expect(first.slug).toBe('still-water-wellness')
    expect(second.slug).toBe('still-water-wellness-2')
  })
})

describe('materializeBusiness — idempotent re-run (update)', () => {
  it('re-applies onto the same Space without duplicating records', async () => {
    const created = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' }, { verificationPolicy: 'allow' })
    const spaceId = created.spaceId!

    const availAfterCreate = H.tables.space_availability.length
    const faqsAfterCreate = H.tables.space_faqs.length
    const eventsAfterCreate = H.tables.events.length
    expect(availAfterCreate).toBe(2)
    expect(faqsAfterCreate).toBe(2)
    expect(eventsAfterCreate).toBe(1)

    // Re-run against the SAME space (update target).
    const rerun = await materializeBusiness(wellnessStudioFixture, { kind: 'update', spaceId }, { verificationPolicy: 'allow' })
    expect(rerun.ok).toBe(true)
    expect(rerun.spaceId).toBe(spaceId)

    // Availability + faqs are delete-then-insert: counts stay the same, no duplication.
    expect(H.tables.space_availability.filter((r) => r.space_id === spaceId).length).toBe(2)
    expect(H.tables.space_faqs.filter((r) => r.space_id === spaceId).length).toBe(2)
    // Events are matched by (space_id, slug): the same event is not re-inserted.
    expect(H.tables.events.filter((e) => e.space_id === spaceId).length).toBe(1)
    expect(rerun.seeded?.events).toBe(1) // reported as seeded (idempotent), not duplicated

    // Exactly one business space exists (the re-run did not create a second).
    expect(H.tables.spaces.filter((s) => s.type === 'business').length).toBe(1)
  })
})

describe('materializeBusiness — Spotlight demo dressing (optional)', () => {
  it('writes a member grid layout and enables Spotlight for the demo owner', async () => {
    const res = await materializeBusiness(
      wellnessStudioFixture,
      { kind: 'create', ownerProfileId: 'owner-1' },
      { demoOwnerProfileId: 'owner-1' },
    )
    expect(res.seeded?.spotlightDressed).toBe(true)
    const owner = H.tables.profiles.find((p) => p.id === 'owner-1')!
    const meta = owner.meta as Record<string, unknown>
    expect((meta.spotlight as Record<string, unknown>).enabled).toBe(true)
    const grid = meta.entityGrid as { rows?: Array<{ cells: string[][] }>; content?: Record<string, unknown> }
    expect(grid.rows?.[0].cells[0]).toEqual(['links'])
    expect(grid.content?.links).toBeTruthy()
  })

  it('does not dress Spotlight when no demo owner is given', async () => {
    const res = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' }, { verificationPolicy: 'allow' })
    expect(res.seeded?.spotlightDressed).toBe(false)
  })
})

// ── Commercial-fact gate: the materializer as an INDEPENDENT second gate (findings #3, #4) ──

describe('materializeBusiness — fail-closed default + ledger gate', () => {
  // REGRESSION (finding #4): with NO verificationPolicy and NO ledger, the default is 'withhold',
  // so a direct call that forgets the flag cannot leak a commercial fact.
  it('defaults to WITHHOLD when neither policy nor ledger is given', async () => {
    const res = await materializeBusiness(wellnessStudioFixture, { kind: 'create', ownerProfileId: 'owner-1' })
    const space = H.tables.spaces.find((s) => s.id === res.spaceId)!
    const profileData = (space.preferences as Record<string, unknown>).profileData as Record<string, unknown>
    expect(profileData.phone).toBeUndefined()
    expect(profileData.address).toBeUndefined()
    expect(profileData.hours).toBeUndefined()
    expect(profileData.rating).toBeUndefined()
    // offering prices (and their priceModel/currency) are withheld too.
    for (const o of profileData.offerings as Record<string, unknown>[]) {
      expect(o.price).toBeUndefined()
      expect(o.priceModel).toBeUndefined()
      expect(o.currency).toBeUndefined()
    }
  })

  // REGRESSION (finding #3): a LEDGER drives a per-field re-derivation, independent of splitVerified.
  // A verified fact publishes (the verified path is alive); an uncleared fact on the same ledger is
  // withheld, even though the caller passed no coarse 'withhold' flag.
  it('publishes only the verified fields from the ledger (verified path revived)', async () => {
    const ledger = {
      'contact.phone': [{ kind: 'fact' as const, confidence: 0.9, verifiedBy: 'auto' as const, snippet: '(503) 555-0142' }],
      // address is inferred (never verified) -> withheld even though the draft carries it
      'contact.address': [{ kind: 'inferred' as const, confidence: 0.4 }],
      'offerings[0].price': [{ kind: 'fact' as const, confidence: 0.9, verifiedBy: 'auto' as const, snippet: '22' }],
    }
    const res = await materializeBusiness(
      wellnessStudioFixture,
      { kind: 'create', ownerProfileId: 'owner-1' },
      { ledger },
    )
    const space = H.tables.spaces.find((s) => s.id === res.spaceId)!
    const profileData = (space.preferences as Record<string, unknown>).profileData as Record<string, unknown>
    expect(profileData.phone).toBe('(503) 555-0142') // verified -> published
    expect(profileData.address).toBeUndefined() //        uncleared -> withheld
    const offerings = profileData.offerings as Record<string, unknown>[]
    expect(offerings[0].price).toBe(22) // verified offering price -> published
    expect(offerings[1].price).toBeUndefined() // no ledger entry -> withheld
  })

  // The ledger overrides an explicit verificationPolicy (per-field re-derivation is stronger).
  it('lets the ledger override a coarse verificationPolicy', async () => {
    const ledger = {
      'contact.phone': [{ kind: 'fact' as const, confidence: 0.9, verifiedBy: 'auto' as const, snippet: '(503) 555-0142' }],
    }
    const res = await materializeBusiness(
      wellnessStudioFixture,
      { kind: 'create', ownerProfileId: 'owner-1' },
      { verificationPolicy: 'allow', ledger },
    )
    const space = H.tables.spaces.find((s) => s.id === res.spaceId)!
    const profileData = (space.preferences as Record<string, unknown>).profileData as Record<string, unknown>
    expect(profileData.phone).toBe('(503) 555-0142') // verified
    expect(profileData.address).toBeUndefined() //        not in ledger -> withheld (ledger wins over allow)
  })
})

// ── applyIntake: reads the row's LEDGER and materializes with a per-field gate (findings #3/#4) ──

describe('applyIntake — ledger-driven per-field gate end to end', () => {
  it('publishes a verified fact and withholds an uncleared one from the same intake ledger', async () => {
    intakeStore.row = {
      id: 'intake-1',
      createdBy: 'owner-1',
      status: 'review',
      inputs: { consent: { isDemo: true } },
      draft: {
        name: 'Ledger Cafe',
        type: 'business',
        contact: { address: '9 Verified Way', phone: '555-0000' },
        offerings: [{ title: 'Latte', price: 5, currency: 'USD', priceModel: 'fixed' }],
      },
      ledger: {
        'contact.address': [{ kind: 'fact', confidence: 0.9, verifiedBy: 'auto', snippet: '9 Verified Way' }],
        // phone + the offering price are NOT verified -> must be withheld
        'contact.phone': [{ kind: 'inferred', confidence: 0.4 }],
        'offerings[0].price': [{ kind: 'generated', confidence: 0.3 }],
      },
      targetSpaceId: null,
    }
    const res = await applyIntake('intake-1')
    expect(res.ok).toBe(true)
    const space = H.tables.spaces.find((s) => s.id === res.spaceId)!
    const profileData = (space.preferences as Record<string, unknown>).profileData as Record<string, unknown>
    expect(profileData.address).toBe('9 Verified Way') // verified -> published (verified path alive)
    expect(profileData.phone).toBeUndefined() //           uncleared -> withheld
    const offerings = profileData.offerings as Record<string, unknown>[]
    expect(offerings[0].price).toBeUndefined() //          unverified price -> withheld
    expect(offerings[0].priceModel).toBeUndefined() //     ...and its priceModel/currency too (#1)
    expect(offerings[0].currency).toBeUndefined()
    expect(offerings[0].title).toBe('Latte') // non-commercial survives
    expect(intakeStore.applied).toContain('intake-1')
  })

  it('refuses to apply from a mid-research status', async () => {
    intakeStore.row = { id: 'x', createdBy: 'owner-1', status: 'researching', inputs: {}, draft: { name: 'X' }, ledger: {}, targetSpaceId: null }
    const res = await applyIntake('x')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not ready to apply/i)
  })
})
