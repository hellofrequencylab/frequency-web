// FH-020X: publishing a Trail binds a live placement to every stop, and a staff-confirmed stop with the
// review switch on publishes a binding the claim command holds a scan against. A small in-memory admin
// client serves the FH-005 tables; the real store, gate (lib/hunts/authz.ts) and draft rules run.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
let seq = 0

function query(table: string) {
  const rows = () => (tables[table] ??= [])
  const filters: ((r: Row) => boolean)[] = []
  let op: { kind: 'select' } | { kind: 'insert'; values: Row[] } | { kind: 'upsert'; values: Row[]; keys: string[]; ignore: boolean } | { kind: 'update'; values: Row } | { kind: 'delete' } = { kind: 'select' }
  let order: { col: string; asc: boolean } | null = null
  let limit = Infinity
  const matching = () => rows().filter((r) => filters.every((f) => f(r)))
  const run = (): { data: unknown; error: { message: string } | null } => {
    if (op.kind === 'insert') {
      const made: Row[] = op.values.map((v) => ({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, ...v }))
      for (const m of made) {
        if (table === 'hunt_placements' && rows().some((r) => r.slug === m.slug)) return { data: null, error: { message: 'duplicate slug' } }
      }
      rows().push(...made)
      return { data: made, error: null }
    }
    if (op.kind === 'upsert') {
      const { keys, ignore } = op
      for (const v of op.values) {
        const hit = rows().find((r) => keys.every((k) => r[k] === v[k]))
        if (hit && !ignore) Object.assign(hit, v)
        if (!hit) rows().push({ ...v })
      }
      return { data: op.values, error: null }
    }
    if (op.kind === 'update') {
      const hit = matching()
      for (const r of hit) Object.assign(r, (op as { values: Row }).values)
      return { data: hit, error: null }
    }
    if (op.kind === 'delete') {
      const hit = new Set(matching())
      tables[table] = rows().filter((r) => !hit.has(r))
      return { data: null, error: null }
    }
    let out = matching()
    if (order) {
      const { col, asc } = order
      out = [...out].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1))
    }
    return { data: out.slice(0, limit), error: null }
  }
  const q = {
    select: () => q,
    insert: (v: Row | Row[]) => { op = { kind: 'insert', values: Array.isArray(v) ? v : [v] }; return q },
    upsert: (v: Row | Row[], o: { onConflict: string; ignoreDuplicates?: boolean }) => {
      op = { kind: 'upsert', values: Array.isArray(v) ? v : [v], keys: o.onConflict.split(','), ignore: o.ignoreDuplicates === true }
      return q
    },
    update: (v: Row) => { op = { kind: 'update', values: v }; return q },
    delete: () => { op = { kind: 'delete' }; return q },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q },
    order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return q },
    limit: (n: number) => { limit = n; return q },
    single: async () => { const r = run(); const d = r.data as Row[] | null; return { data: d?.[0] ?? null, error: r.error } },
    maybeSingle: async () => { const r = run(); const d = r.data as Row[] | null; return { data: d?.[0] ?? null, error: r.error } },
    then: (resolve: (r: ReturnType<typeof run>) => unknown, reject?: (e: unknown) => unknown) => {
      try { return Promise.resolve(resolve(run())) } catch (e) { return reject ? reject(e) : Promise.reject(e) }
    },
  }
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }))

import { decide } from './authz'
import { parseTrailDraft, type TrailDraft } from './draft'
import { publishTrail } from './store'

const ACTOR = { profileId: 'owner-1' }
const stop = (n: number, over: Partial<TrailDraft['stops'][number]> = {}) => ({ place: `Place ${n}`, clue: `Clue ${n}`, placementReady: true, ...over })

function seed(input: { ownerSpaceId?: string | null; stops: TrailDraft['stops'] }) {
  for (const k of Object.keys(tables)) delete tables[k]
  const spaceOwned = input.ownerSpaceId != null
  tables.hunts = [{
    id: 'hunt-1', slug: 'harbor-walk', visibility: 'private', status: 'draft', current_version_id: null, revision: 4,
    owner_profile_id: spaceOwned ? null : ACTOR.profileId, owner_space_id: input.ownerSpaceId ?? null,
  }]
  // A Space-owned Hunt reaches its publisher through a role grant, as the gate requires.
  tables.hunt_roles = spaceOwned ? [{ hunt_id: 'hunt-1', profile_id: ACTOR.profileId, role: 'admin', expires_at: null, revoked_at: null }] : []
  tables.hunt_versions = [{
    id: 'ver-1', hunt_id: 'hunt-1', version_no: 1, status: 'draft', content_hash: null, published_at: null,
    policy: { trail: { title: 'Harbor walk', hook: '', area: '', audience: '', stops: input.stops, routeTestedAtRevision: 4, permissionConfirmed: false } },
  }]
}

const bindings = () => (tables.hunt_mission_placements ?? []) as { mission_key: string; placement_id: string; venue_space_id: string | null; evidence_policy: Row }[]

/** The rule hunt_claim_apply applies to a scan below the mission's assurance (20270346053000). */
function scanAnswer(assurance: 'signed_node', mission: { required_assurance: string }, binding: { evidence_policy: Row } | undefined) {
  const rank = (a: string) => (a === 'none' ? 0 : a === 'signed_node' ? 1 : 3)
  if (!binding) return 'placement_not_valid'
  if (rank(assurance) >= rank(mission.required_assurance)) return 'credited'
  return rank(assurance) >= 1 && rank(mission.required_assurance) === 3 && binding.evidence_policy.hold_for_review === true ? 'held' : 'assurance_too_low'
}

beforeEach(() => { seq = 0 })
afterEach(() => { for (const k of Object.keys(tables)) delete tables[k] })

describe('publishing binds a placement to every stop (FH-020X)', () => {
  it('creates a node and a QR placement per stop and binds each to its mission on the published version', async () => {
    seed({ stops: [stop(1), stop(2), stop(3)] })
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(tables.hunt_nodes).toHaveLength(3)
    expect(tables.hunt_placements.map((p) => p.medium)).toEqual(['qr', 'qr', 'qr'])
    expect(tables.hunt_placements.every((p) => /^[a-z0-9-]{6,80}$/.test(p.slug as string))).toBe(true)
    expect(bindings().map((b) => [b.mission_key, b.placement_id])).toEqual(res.placementIds.map((id, i) => [`stop-${i + 1}`, id]))
    expect(new Set(res.placementIds).size).toBe(3)
    // A plain Trail keeps the signed scan and an empty policy.
    expect(tables.hunt_missions.map((m) => m.required_assurance)).toEqual(['signed_node', 'signed_node', 'signed_node'])
    expect(bindings().every((b) => Object.keys(b.evidence_policy).length === 0 && b.venue_space_id === null)).toBe(true)
    // The frozen version remembers each stop's placement, so the next version reuses the printed code.
    const frozen = parseTrailDraft((tables.hunt_versions[0].policy as { trail: unknown }).trail)
    expect(frozen.stops.map((s) => s.placementId)).toEqual(res.placementIds)
  })

  it('a staff-confirmed stop with the review switch on yields a hold_for_review binding, and a scan there answers held', async () => {
    seed({ ownerSpaceId: 'space-9', stops: [stop(1), stop(2, { staffConfirmed: true, holdForReview: true }), stop(3, { staffConfirmed: true })] })
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res.ok).toBe(true)
    const mission = (key: string) => tables.hunt_missions.find((m) => m.mission_key === key) as { required_assurance: string }
    const binding = (key: string) => bindings().find((b) => b.mission_key === key)
    expect(mission('stop-2').required_assurance).toBe('staff')
    expect(binding('stop-2')).toMatchObject({ venue_space_id: 'space-9', evidence_policy: { hold_for_review: true } })
    expect(binding('stop-3')?.evidence_policy).toEqual({})

    // The scan path credits at signed_node (lib/hunts/claim-guard.ts); the database rule decides the rest.
    expect(scanAnswer('signed_node', mission('stop-2'), binding('stop-2'))).toBe('held')
    expect(scanAnswer('signed_node', mission('stop-3'), binding('stop-3'))).toBe('assurance_too_low')
    expect(scanAnswer('signed_node', mission('stop-1'), binding('stop-1'))).toBe('credited')
  })

  it('the hold rule modelled above is the one the claim command runs', () => {
    const sql = readFileSync('supabase/migrations/20270346053000_hunt_claim_hold.sql', 'utf8')
    expect(sql).toContain("rank_have >= 1 and rank_need = 3")
    expect(sql).toContain("mp.evidence_policy -> 'hold_for_review' = 'true'::jsonb")
    expect(sql).toContain("jsonb_build_object('result', 'held', 'claim_id', claim_id)")
  })

  it('refuses a staff-confirmed stop on a Trail no Space runs, and writes nothing', async () => {
    seed({ stops: [stop(1, { staffConfirmed: true }), stop(2), stop(3)] })
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res).toMatchObject({ ok: false, reason: 'checklist' })
    expect(tables.hunt_placements ?? []).toHaveLength(0)
    expect(bindings()).toHaveLength(0)
  })

  it('keeps a live placement the stop names, replaces a revoked or foreign one, and never binds one placement twice', async () => {
    seed({ stops: [] })
    tables.hunt_placements = [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', hunt_id: 'hunt-1', slug: 'kept-code', medium: 'qr', revoked_at: null },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', hunt_id: 'hunt-1', slug: 'pulled-code', medium: 'qr', revoked_at: '2026-11-01T00:00:00Z' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000003', hunt_id: 'hunt-2', slug: 'other-hunt', medium: 'qr', revoked_at: null },
    ]
    const [kept, revoked, foreign] = tables.hunt_placements.map((p) => p.id as string)
    ;(tables.hunt_versions[0].policy as { trail: { stops: unknown[] } }).trail.stops = [
      stop(1, { placementId: kept }), stop(2, { placementId: revoked }), stop(3, { placementId: foreign }), stop(4, { placementId: kept }),
    ]
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.placementIds[0]).toBe(kept)
    expect(res.placementIds.slice(1)).not.toContain(kept)
    expect(res.placementIds).not.toContain(revoked)
    expect(res.placementIds).not.toContain(foreign)
    expect(new Set(res.placementIds).size).toBe(4)
  })

  it('a retry after a stop moved drops the stale pairing, so each placement names one mission', async () => {
    seed({ stops: [] })
    const [p1, p2] = ['bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002']
    tables.hunt_placements = [p1, p2].map((id, i) => ({ id, hunt_id: 'hunt-1', slug: `code-${i}xyz`, medium: 'qr', revoked_at: null }))
    tables.hunt_mission_placements = [
      { version_id: 'ver-1', hunt_id: 'hunt-1', mission_key: 'stop-1', placement_id: p1, venue_space_id: null, evidence_policy: {} },
      { version_id: 'ver-1', hunt_id: 'hunt-1', mission_key: 'stop-2', placement_id: p2, venue_space_id: null, evidence_policy: {} },
    ]
    ;(tables.hunt_versions[0].policy as { trail: { stops: unknown[] } }).trail.stops = [stop(1, { placementId: p2 }), stop(2, { placementId: p1 }), stop(3)]
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res.ok).toBe(true)
    for (const id of [p1, p2]) expect(bindings().filter((b) => b.placement_id === id)).toHaveLength(1)
    expect(bindings().find((b) => b.placement_id === p2)?.mission_key).toBe('stop-1')
  })
})

describe('publishing a Passport with partner places and regions (FH-030S)', () => {
  const CAFE = 'cccccccc-0000-4000-8000-000000000001'
  const PARK = 'cccccccc-0000-4000-8000-000000000002'
  const partner = (space_id: string, over: Row = {}) => ({ hunt_id: 'hunt-1', space_id, status: 'accepted', effective_at: '2026-01-01T00:00:00Z', revoked_at: null, permitted_roles: ['operator'], ...over })
  const trail = () => (tables.hunt_versions[0].policy as { trail: Record<string, unknown> }).trail
  const passport = (extra: Record<string, unknown>) => {
    seed({ ownerSpaceId: 'space-9', stops: [1, 2, 3, 4, 5].map((n) => stop(n)) })
    Object.assign(trail(), { shape: 'passport', finishCount: 3, ...extra })
  }

  it('writes the count group with min_count, each stop\'s venue, the substitute code and the regions', async () => {
    passport({
      venues: [{ stop: 'stop-2', venueSpaceId: CAFE, substitute: PARK }],
      regions: [{ name: 'Harbor', enabled: true, stops: ['stop-1', 'stop-2', 'stop-3'] }, { name: 'Pier', enabled: false, stops: ['stop-4'] }],
    })
    tables.hunt_partners = [partner(CAFE), partner(PARK)]
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res.ok).toBe(true)
    expect(tables.hunt_rule_groups).toEqual([expect.objectContaining({ group_key: 'finish', target_finish: true, logic: 'count', min_count: 3 })])
    const stop2 = bindings().filter((b) => b.mission_key === 'stop-2')
    expect(stop2.map((b) => b.venue_space_id).sort()).toEqual([CAFE, PARK].sort())
    expect(new Set(stop2.map((b) => b.placement_id)).size).toBe(2)
    expect(bindings().find((b) => b.mission_key === 'stop-1')?.venue_space_id).toBe('space-9')
    expect((tables.hunt_versions[0].policy as { chapters: unknown }).chapters).toEqual([
      { chapter_key: 'region-1', enabled: true, members: ['stop-1', 'stop-2', 'stop-3'] },
      { chapter_key: 'region-2', enabled: false, members: ['stop-4'] },
    ])
  })

  it('refuses a stop at a partner that withdrew, and a planned closure that breaks a region, writing nothing', async () => {
    passport({ venues: [{ stop: 'stop-2', venueSpaceId: CAFE }] })
    tables.hunt_partners = [partner(CAFE, { status: 'withdrawn', revoked_at: '2026-11-01T00:00:00Z' })]
    expect(await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)).toMatchObject({ ok: false, reason: 'checklist' })
    expect(bindings()).toHaveLength(0)

    passport({
      finishCount: 2,
      venues: [{ stop: 'stop-1', venueSpaceId: CAFE }],
      regions: [{ name: 'Harbor', enabled: true, stops: ['stop-1', 'stop-2'] }, { name: 'Old town', enabled: true, stops: ['stop-3', 'stop-4', 'stop-5'] }],
    })
    // Live today, with an end date: the Harbor region could not be finished once it leaves.
    tables.hunt_partners = [partner(CAFE, { revoked_at: '2099-01-01T00:00:00Z' })]
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res).toMatchObject({ ok: false, reason: 'checklist' })
    if (res.ok || res.reason !== 'checklist') return
    expect(res.items.find((i) => i.code === 'venue_closure')).toMatchObject({ ok: false })
    expect(bindings()).toHaveLength(0)
  })
})

describe('a resident Trail names a partner venue for a staff-confirmed stop (FH-020Y)', () => {
  const CAFE = 'cccccccc-0000-4000-8000-000000000011'
  const PARK = 'cccccccc-0000-4000-8000-000000000012'
  const partner = (space_id: string, over: Row = {}) => ({ hunt_id: 'hunt-1', space_id, status: 'accepted', effective_at: '2026-01-01T00:00:00Z', revoked_at: null, permitted_roles: ['operator'], ...over })
  const resident = (venues: unknown[]) => {
    seed({ stops: [stop(1), stop(2, { staffConfirmed: true, holdForReview: true }), stop(3)] })
    Object.assign((tables.hunt_versions[0].policy as { trail: Record<string, unknown> }).trail, { venues })
  }
  const staffItem = (res: Awaited<ReturnType<typeof publishTrail>>) =>
    !res.ok && res.reason === 'checklist' ? res.items.find((i) => i.code === 'stop_staff_venue') : undefined

  it('publishes with the partner as the binding venue, so that venue\'s staff may review a held visit there', async () => {
    resident([{ stop: 'stop-2', venueSpaceId: CAFE }])
    tables.hunt_partners = [partner(CAFE)]
    const res = await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true)
    expect(res.ok).toBe(true)
    const held = bindings().find((b) => b.mission_key === 'stop-2')
    expect(held).toMatchObject({ venue_space_id: CAFE, evidence_policy: { hold_for_review: true } })
    expect(bindings().find((b) => b.mission_key === 'stop-1')?.venue_space_id).toBeNull()
    expect((tables.hunt_missions as Row[]).find((m) => m.mission_key === 'stop-2')?.required_assurance).toBe('staff')

    // The staff queue (lib/hunts/staff-queue-store.ts) attributes a held claim to this venue_space_id and asks the gate.
    const facts = (staffSpaceIds: string[], now = '2026-11-16T12:00:00Z') => ({
      hunt: { id: 'hunt-1', visibility: 'unlisted' as const, ownerProfileId: ACTOR.profileId, ownerSpaceId: null },
      grants: [],
      partners: [{ huntId: 'hunt-1', spaceId: CAFE, status: 'accepted' as const, effectiveAt: '2026-01-01T00:00:00Z', revokedAt: null, permittedRoles: ['operator'] }],
      actor: { profileId: 'barista-1', staffSpaceIds },
      ctx: { venueSpaceId: held?.venue_space_id, targetHuntId: 'hunt-1' },
      now,
    })
    expect(decide('review_claim', facts([CAFE])).allow).toBe(true)
    expect(decide('review_claim', facts([PARK])).allow).toBe(false)
  })

  it('still refuses when no venue is named, the partner is not live, or it may not confirm visits, writing nothing', async () => {
    resident([])
    expect(staffItem(await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true))).toMatchObject({ ok: false, stop: 1 })

    resident([{ stop: 'stop-2', venueSpaceId: CAFE }])
    tables.hunt_partners = [partner(CAFE, { status: 'withdrawn', revoked_at: '2026-11-01T00:00:00Z' })]
    expect(staffItem(await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true))).toMatchObject({ ok: false, stop: 1 })

    resident([{ stop: 'stop-2', venueSpaceId: CAFE }])
    tables.hunt_partners = [partner(CAFE, { permitted_roles: [] })]
    expect(staffItem(await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true))).toMatchObject({ ok: false, stop: 1 })

    // A substitute place needs staff too: a held visit there goes to its staff.
    resident([{ stop: 'stop-2', venueSpaceId: CAFE, substitute: PARK }])
    tables.hunt_partners = [partner(CAFE), partner(PARK, { permitted_roles: [] })]
    expect(staffItem(await publishTrail('hunt-1', ACTOR, 4, 'unlisted', true))).toMatchObject({ ok: false, stop: 1 })
    expect(bindings()).toHaveLength(0)
    expect(tables.hunt_placements ?? []).toHaveLength(0)
  })
})
