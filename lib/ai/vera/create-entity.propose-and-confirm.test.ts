import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE WIZARD ROAD THROUGH THE GOVERNED CREATE LAYER (ADR-1249; ADR-988 the layer itself).
//
// `proposeAndConfirmCreate` is what fifteen creation wizards call when a member taps Create. It
// must be exactly the two phases in sequence and nothing more: no gate skipped, no audit row
// missed, no second authority invented. So these tests drive the REAL propose and confirm code
// over a tiny in-memory `agent_actions` table, with only the session, the capability policy and
// the Supabase client stubbed, and assert the consequences ADR-988 promises:
//
//   * one audit row, proposed -> approved -> executed, carrying the entity, the draft, the gate
//     and the caller the layer derived itself;
//   * the commit receives that caller, never one the wizard passed;
//   * a draft the manifest rejects, a lapsed capability, or a signed-out session commits NOTHING
//     and writes no row claiming otherwise;
//   * a commit that throws closes the row out `failed` and returns the writer's own sentence;
//   * a `scoped` gate is recorded and left to the commit (the layer is not a second authority).

let caller: { id: string } | null = { id: 'p1' }
const granted = new Set<string>()

vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => caller }))
vi.mock('@/lib/core/load-capabilities', () => ({ canCreate: async (cap: string) => granted.has(cap) }))
// The commit registry imports the Circle writer, which reaches the admin client at import.
vi.mock('@/lib/circles/draft', () => ({ createBlankCircleDraft: vi.fn() }))

// ── A tiny agent_actions table behind the query-builder surface the layer uses ───────────────
type Row = Record<string, unknown> & { id: string }
const rows = new Map<string, Row>()
let nextId = 1

function table() {
  const state: { op: 'select' | 'insert' | 'update'; values?: Record<string, unknown>; filters: [string, unknown][] } = {
    op: 'select',
    filters: [],
  }
  const matches = (r: Row) => state.filters.every(([col, val]) => r[col] === val)
  function run() {
    if (state.op === 'insert') {
      const id = `a${nextId++}`
      const row: Row = { id, created_at: new Date().toISOString(), ...state.values }
      rows.set(id, row)
      return { data: { id }, error: null }
    }
    if (state.op === 'update') {
      const hits = [...rows.values()].filter(matches)
      for (const r of hits) Object.assign(r, state.values)
      return { data: hits[0] ? { id: hits[0].id } : null, error: null }
    }
    return { data: [...rows.values()].find(matches) ?? null, error: null }
  }
  const api = {
    insert(v: Record<string, unknown>) {
      state.op = 'insert'
      state.values = v
      return api
    },
    update(v: Record<string, unknown>) {
      state.op = 'update'
      state.values = v
      return api
    },
    select() {
      return api
    },
    eq(col: string, val: unknown) {
      state.filters.push([col, val])
      return api
    },
    async single() {
      return run()
    },
    async maybeSingle() {
      return run()
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(res, rej)
    },
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => table() }) }))

const { proposeAndConfirmCreate, CREATE_AUDIT_KIND } = await import('./create-entity')

const only = () => {
  expect(rows.size).toBe(1)
  return [...rows.values()][0]
}

beforeEach(() => {
  rows.clear()
  nextId = 1
  caller = { id: 'p1' }
  granted.clear()
  granted.add('circle.create')
})

describe('proposeAndConfirmCreate: the wizard road (ADR-1249)', () => {
  it('writes one audit row proposed -> approved -> executed and runs the commit with the derived caller', async () => {
    const commit = vi.fn(async (input: { actorProfileId: string; proposalId: string; entity: string }) => ({
      slug: 'sunrise-swim',
      seenBy: input.actorProfileId,
      proposalId: input.proposalId,
      entity: input.entity,
    }))
    const res = await proposeAndConfirmCreate({
      entity: 'circle',
      draft: { name: 'Sunrise Swim', about: 'A cold dip before work.' },
      rationale: 'Circle builder, spark road.',
      commit,
    })
    expect('data' in res).toBe(true)
    if (!('data' in res)) return
    expect(res.data.slug).toBe('sunrise-swim')
    // The commit saw the caller the LAYER derived, and the row it is recorded against.
    expect(res.data.seenBy).toBe('p1')
    expect(res.data.entity).toBe('circle')
    const row = only()
    expect(res.data.proposalId).toBe(row.id)
    expect(row.kind).toBe(CREATE_AUDIT_KIND)
    expect(row.status).toBe('executed')
    expect(row.decided_by).toBe('p1')
    const payload = row.payload as Record<string, unknown>
    expect(payload.entity).toBe('circle')
    expect(payload.actor_profile_id).toBe('p1')
    expect(payload.gate).toBe('circle.create')
    expect(payload.ai_drafted).toBe(false)
    expect(payload.outcome).toBe('executed')
    expect(row.rationale).toBe('Circle builder, spark road.')
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('refuses a draft the manifest rejects, commits nothing, and writes no row', async () => {
    const commit = vi.fn()
    const res = await proposeAndConfirmCreate({ entity: 'circle', draft: {}, commit })
    expect(res).toEqual({ error: 'Circle needs a Name.' })
    expect(commit).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)
  })

  it('refuses a lapsed capability before anything is written', async () => {
    granted.clear()
    const commit = vi.fn()
    const res = await proposeAndConfirmCreate({ entity: 'circle', draft: { name: 'X' }, commit })
    expect('error' in res).toBe(true)
    expect(commit).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)
  })

  it('refuses a signed-out session', async () => {
    caller = null
    const commit = vi.fn()
    const res = await proposeAndConfirmCreate({ entity: 'circle', draft: { name: 'X' }, commit })
    expect(res).toEqual({ error: 'Sign in first.' })
    expect(commit).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)
  })

  it("closes the row out failed and returns the writer's own sentence when the commit throws", async () => {
    const res = await proposeAndConfirmCreate({
      entity: 'circle',
      draft: { name: 'X' },
      commit: async () => {
        throw new Error('Could not create that circle. Please try again.')
      },
    })
    expect(res).toEqual({ error: 'Could not create that circle. Please try again.' })
    const row = only()
    expect(row.status).toBe('failed')
    expect((row.payload as Record<string, unknown>).error).toBe('Could not create that circle. Please try again.')
  })

  it('records a scoped gate and leaves it to the commit rather than becoming a second authority', async () => {
    granted.clear() // no capability of any kind is granted
    const commit = vi.fn(async () => ({ id: 'l1' }))
    const res = await proposeAndConfirmCreate({
      entity: 'listing',
      draft: { title: 'Free firewood' },
      commit,
    })
    expect(res).toEqual({ data: { id: 'l1' } })
    expect(commit).toHaveBeenCalledTimes(1)
    expect((only().payload as Record<string, unknown>).gate).toBe('scoped:listing')
  })

  // ADR-1280 (a). The Space Practice road is open to a free Space manager while `practice` is a
  // Crew-only capability. The road declares the gate it enforces; the layer records it and does
  // not re-apply the capability. Without the declaration the same call is refused, which is the
  // control that proves the road gate is what let it through.
  it('records a road gate in place of the capability and commits without it granted', async () => {
    granted.clear()
    const commit = vi.fn(async () => ({ id: 'pr1' }))
    const roadGate = { kind: 'scoped' as const, why: 'authorizeSpaceAuthor: the caller manages this Space.' }
    const refused = await proposeAndConfirmCreate({ entity: 'practice', draft: { title: 'Untitled practice' }, commit })
    expect('error' in refused).toBe(true)
    expect(commit).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)

    const res = await proposeAndConfirmCreate({ entity: 'practice', draft: { title: 'Untitled practice' }, spaceId: 's1', roadGate, commit })
    expect(res).toEqual({ data: { id: 'pr1' } })
    expect(commit).toHaveBeenCalledTimes(1)
    const payload = only().payload as Record<string, unknown>
    expect(payload.gate).toBe('road:practice')
    expect(payload.road_gate).toEqual(roadGate)
    expect(payload.stage).toBe('publish')
    expect(only().status).toBe('executed')
  })

  it('cannot scope its way into an entity the Studio does not make', async () => {
    const commit = vi.fn()
    const res = await proposeAndConfirmCreate({
      entity: 'channel',
      draft: { name: 'x' },
      roadGate: { kind: 'scoped', why: 'the caller manages the Space' },
      commit,
    })
    expect('error' in res).toBe(true)
    expect(commit).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)
  })

  // ADR-1280 (b). A draft-status Event is a create, and the manifest defers `startsAt` to publish.
  // At stage 'draft' the flyer's row is proposed, claimed and committed; at the default stage the
  // same draft is refused, so the wizard's live create still needs a start.
  it('lets a draft-status Event be created without a start, and records the stage', async () => {
    granted.add('event.create')
    const commit = vi.fn(async () => ({ id: 'e1' }))
    const flyer = { title: 'Untitled event', description: '', startsAt: '' }
    const strict = await proposeAndConfirmCreate({ entity: 'event', draft: flyer, commit })
    expect(strict).toEqual({ error: 'Event needs a Starts.' })
    expect(commit).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)

    const res = await proposeAndConfirmCreate({ entity: 'event', draft: flyer, stage: 'draft', commit })
    expect(res).toEqual({ data: { id: 'e1' } })
    expect(commit).toHaveBeenCalledTimes(1)
    const row = only()
    expect(row.status).toBe('executed')
    expect((row.payload as Record<string, unknown>).stage).toBe('draft')
    expect((row.payload as Record<string, unknown>).gate).toBe('event.create')
  })

  it('still holds a draft to its create-time fields', async () => {
    granted.add('event.create')
    const commit = vi.fn()
    const res = await proposeAndConfirmCreate({ entity: 'event', draft: {}, stage: 'draft', commit })
    expect(res).toEqual({ error: 'Event needs a Title.' })
    expect(commit).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)
  })

  it('carries the Space the create lands under into the audit row and the commit', async () => {
    const commit = vi.fn(async (input: { spaceId: string | null }) => ({ spaceId: input.spaceId }))
    const res = await proposeAndConfirmCreate({
      entity: 'circle',
      draft: { name: 'Team Circle' },
      spaceId: 's9',
      commit,
    })
    expect(res).toEqual({ data: { spaceId: 's9' } })
    expect((only().payload as Record<string, unknown>).space_id).toBe('s9')
  })
})
