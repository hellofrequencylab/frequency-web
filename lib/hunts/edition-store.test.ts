// FH-044: the edition store keeps the three guarantees when it touches the database. Releasing an
// edition writes no run, credit or claim; a run is read against its own edition; an import writes one
// draft and reads the legacy tables only; old grants are read for one profile and never copied.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  authorizeHuntAction: vi.fn(),
  publishTrail: vi.fn(),
  createTrailDraft: vi.fn(),
  listHuntsForSpace: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('./store', () => ({ authorizeHuntAction: mocks.authorizeHuntAction, publishTrail: mocks.publishTrail, createTrailDraft: mocks.createTrailDraft }))
vi.mock('@/lib/loyalty/hunt-store', () => ({ listHuntsForSpace: mocks.listHuntsForSpace }))

import { createImportedDraft, loadEarlierRun, loadQrCampaignImport, loadRegularsImport, loadRunRecord, previewRelease, readOldGrants, releaseEdition } from './edition-store'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let writes: { table: string; op: string; values: unknown; filters: Row }[]

/** A PostgREST stand-in that applies filters, applies updates and upserts to the rows, and records every write. */
function fakeFrom(table: string) {
  const all = () => (tables[table] ??= [])
  let rows = [...all()]
  const filters: Row = {}
  let pending: { op: 'update' | 'delete'; values?: Row } | null = null
  const settle = () => {
    if (pending?.op === 'update') for (const r of rows) Object.assign(r, pending.values)
    if (pending?.op === 'delete') tables[table] = all().filter((r) => !rows.includes(r))
    if (pending) writes.push({ table, op: pending.op, values: pending.values ?? null, filters: { ...filters } })
    pending = null
    return { data: rows, count: rows.length, error: null }
  }
  const q = {
    select: () => q,
    eq(column: string, value: unknown) { filters[column] = value; rows = rows.filter((r) => r[column] === value); return q },
    in(column: string, values: unknown[]) { rows = rows.filter((r) => values.includes(r[column])); return q },
    not(column: string) { rows = rows.filter((r) => r[column] != null); return q },
    order(column: string, opts?: { ascending?: boolean }) {
      rows = [...rows].sort((a, b) => (a[column] as number) - (b[column] as number) || 0)
      if (opts?.ascending === false) rows.reverse()
      return q
    },
    limit: () => q,
    update(values: Row) { pending = { op: 'update', values }; return q },
    delete() { pending = { op: 'delete' }; return q },
    upsert(values: Row[]) {
      for (const v of values) all().push({ ...v })
      writes.push({ table, op: 'upsert', values, filters: {} })
      return Promise.resolve({ error: null })
    },
    maybeSingle: async () => { const r = settle(); return { data: r.data.length === 1 ? r.data[0] : null, error: null } },
    then: (resolve: (v: { data: Row[]; count: number; error: null }) => unknown) => resolve(settle()),
  }
  return q
}

const stops = (...names: string[]) => names.map((place) => ({ place, clue: 'Look up.', hint: '', placementReady: true }))
const actor = { profileId: 'owner' }
const release = { baseRevision: 7, label: ' Summer ', visibility: 'unlisted' as const, permissionConfirmed: true }

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_AUTHORING_ENABLED', '1')
  writes = []
  tables = {
    hunts: [{ id: 'hunt-1', slug: 'coast-trail', current_version_id: 'v1' }],
    hunt_versions: [
      { id: 'v1', hunt_id: 'hunt-1', version_no: 1, status: 'published', policy: { trail: { title: 'Coast, spring', stops: stops('Pier', 'Bakery', 'Library') } } },
      { id: 'v2', hunt_id: 'hunt-1', version_no: 2, status: 'draft', policy: { trail: { title: 'Coast, summer', stops: stops('Library', 'Pier', 'Museum') } } },
    ],
    hunt_mission_placements: [
      { version_id: 'v1', hunt_id: 'hunt-1', mission_key: 'stop-1', placement_id: 'sign-pier', venue_space_id: null, evidence_policy: {} },
      { version_id: 'v1', hunt_id: 'hunt-1', mission_key: 'stop-2', placement_id: 'sign-bakery', venue_space_id: 'space-b', evidence_policy: { hold_for_review: true } },
      { version_id: 'v1', hunt_id: 'hunt-1', mission_key: 'stop-3', placement_id: 'sign-library', venue_space_id: null, evidence_policy: {} },
    ],
    hunt_runs: [
      { id: 'run-old', hunt_id: 'hunt-1', version_id: 'v1', subject_profile_id: 'player', state: 'active' },
      { id: 'run-done', hunt_id: 'hunt-1', version_id: 'v1', subject_profile_id: 'other', state: 'completed' },
    ],
    hunt_missions: [
      { version_id: 'v1', mission_key: 'stop-1', title: 'Pier', visible_body: 'Old clue', locked_teaser: null, opens_at: null, closes_at: null },
      { version_id: 'v1', mission_key: 'stop-2', title: 'Bakery', visible_body: 'Old clue', locked_teaser: null, opens_at: null, closes_at: null },
      { version_id: 'v2', mission_key: 'stop-1', title: 'Library', visible_body: 'New clue', locked_teaser: null, opens_at: null, closes_at: null },
    ],
    hunt_rule_groups: [{ id: 'g1', version_id: 'v1', target_mission_key: 'stop-2', target_finish: false, logic: 'all', min_count: null, group_key: null }],
    hunt_rule_group_members: [{ group_id: 'g1', version_id: 'v1', member_mission_key: 'stop-1' }],
    hunt_progress: [{ run_id: 'run-old', mission_key: 'stop-1', disposition: 'credited' }],
  }
  mocks.from.mockImplementation(fakeFrom)
  mocks.authorizeHuntAction.mockResolvedValue({ id: 'hunt-1', ownerSpaceId: null, currentVersionId: 'v1' })
  // The real publish flips the draft and repoints the Hunt; the stand-in does the same to the rows.
  mocks.publishTrail.mockImplementation(async () => {
    tables.hunt_versions[1].status = 'published'
    tables.hunts[0].current_version_id = 'v2'
    return { ok: true, versionNo: 2, contentHash: 'h', visibility: 'unlisted' }
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

const tablesWritten = () => [...new Set(writes.map((w) => w.table))].sort()

describe('releaseEdition', () => {
  it('moves each printed code with its place and retires the code whose place was dropped', async () => {
    const out = await releaseEdition('hunt-1', actor, release)
    expect(out).toEqual({ ok: true, versionNo: 2, carried: 2, retired: ['sign-bakery'], pinnedRuns: 1 })
    const carried = tables.hunt_mission_placements.filter((b) => b.version_id === 'v2').map((b) => [b.placement_id, b.mission_key])
    expect(carried).toEqual([['sign-pier', 'stop-2'], ['sign-library', 'stop-1']])
    expect(tables.hunt_mission_placements.filter((b) => b.version_id === 'v1')).toHaveLength(3)
  })

  it('records the crosswalk on the edition before it publishes, and retires the outgoing edition after', async () => {
    await releaseEdition('hunt-1', actor, release)
    expect((tables.hunt_versions[1].policy as { edition: unknown }).edition).toEqual({
      label: 'Summer', previousVersionId: 'v1', crosswalk: { 'stop-1': 'stop-2', 'stop-2': null, 'stop-3': 'stop-1' },
    })
    expect(mocks.publishTrail).toHaveBeenCalledWith('hunt-1', actor, 7, 'unlisted', true)
    expect(tables.hunt_versions[0].status).toBe('superseded')
    expect(writes.map((w) => `${w.table}:${w.op}`)).toEqual(['hunt_versions:update', 'hunt_mission_placements:upsert', 'hunt_versions:update'])
  })

  it('writes no run, credit or claim, and leaves the Hunt address alone: existing runs keep their edition', async () => {
    const before = JSON.stringify([tables.hunt_runs, tables.hunt_progress])
    await releaseEdition('hunt-1', actor, release)
    expect(tablesWritten()).toEqual(['hunt_mission_placements', 'hunt_versions'])
    expect(JSON.stringify([tables.hunt_runs, tables.hunt_progress])).toBe(before)
    expect(tables.hunt_runs[0].version_id).toBe('v1')
    expect(tables.hunts[0].slug).toBe('coast-trail')
  })

  it('a refused publish carries nothing and retires nothing', async () => {
    mocks.publishTrail.mockResolvedValue({ ok: false, reason: 'checklist', items: [] })
    expect(await releaseEdition('hunt-1', actor, release)).toEqual({ ok: false, reason: 'checklist', items: [] })
    expect(tables.hunt_versions[0].status).toBe('published')
    expect(tables.hunt_mission_placements.some((b) => b.version_id === 'v2')).toBe(false)
  })

  it('finishes a release that published and then failed', async () => {
    tables.hunt_versions[1] = { ...tables.hunt_versions[1], status: 'published', policy: { trail: {}, edition: { label: 'Summer', previousVersionId: 'v1', crosswalk: { 'stop-1': 'stop-2' } } } }
    mocks.authorizeHuntAction.mockResolvedValue({ id: 'hunt-1', ownerSpaceId: null, currentVersionId: 'v2' })
    expect(await releaseEdition('hunt-1', actor, release)).toEqual({ ok: true, versionNo: 2, carried: 1, retired: ['sign-bakery', 'sign-library'], pinnedRuns: 1 })
    expect(mocks.publishTrail).not.toHaveBeenCalled()
    expect(tables.hunt_versions[0].status).toBe('superseded')
    expect(await releaseEdition('hunt-1', actor, release)).toEqual({ ok: false, reason: 'nothing_to_release' })
  })

  it('a first edition has nothing to carry or retire', async () => {
    tables.hunt_versions = [{ id: 'v1', hunt_id: 'hunt-1', version_no: 1, status: 'draft', policy: { trail: { stops: stops('Pier') } } }]
    mocks.authorizeHuntAction.mockResolvedValue({ id: 'hunt-1', ownerSpaceId: null, currentVersionId: null })
    mocks.publishTrail.mockResolvedValue({ ok: true, versionNo: 1, contentHash: 'h', visibility: 'unlisted' })
    expect(await releaseEdition('hunt-1', actor, { ...release, label: '' })).toEqual({ ok: true, versionNo: 1, carried: 0, retired: [], pinnedRuns: 0 })
    expect((tables.hunt_versions[0].policy as { edition: { label: string } }).edition.label).toBe('Edition 1')
  })

  it('refuses someone who may not publish, and everyone while authoring is off', async () => {
    mocks.authorizeHuntAction.mockResolvedValueOnce(null)
    expect(await releaseEdition('hunt-1', { profileId: 'stranger' }, release)).toEqual({ ok: false, reason: 'forbidden' })
    expect(mocks.authorizeHuntAction).toHaveBeenCalledWith('hunt-1', { profileId: 'stranger' }, 'publish')
    vi.stubEnv('HUNTS_AUTHORING_ENABLED', '')
    mocks.authorizeHuntAction.mockClear()
    expect(await releaseEdition('hunt-1', actor, release)).toEqual({ ok: false, reason: 'forbidden' })
    expect(mocks.authorizeHuntAction).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })
})

describe('loadRunRecord', () => {
  it('reads a run against the edition it started on after a newer one is live', async () => {
    await releaseEdition('hunt-1', actor, release)
    writes = []
    const record = await loadRunRecord('player', 'run-old')
    expect(record).toMatchObject({ standing: 'record', editionNo: 1, editionLabel: null, title: 'Coast, spring', credits: [{ mission_key: 'stop-1' }] })
    expect(record?.content.map((c) => [c.mission_key, c.title, c.visible_body])).toEqual([['stop-1', 'Pier', 'Old clue'], ['stop-2', 'Bakery', 'Old clue']])
    expect(record?.graph.missions[1].rule_groups).toEqual([{ logic: 'all', members: ['stop-1'] }])
    expect(writes).toEqual([])
  })

  it('a run on the current edition is still playing', async () => {
    expect((await loadRunRecord('player', 'run-old'))?.standing).toBe('playing')
  })

  it("is the subject's alone, and dark with the switch off", async () => {
    expect(await loadRunRecord('other', 'run-old')).toBeNull()
    vi.stubEnv('HUNTS_ENABLED', '')
    expect(await loadRunRecord('player', 'run-old')).toBeNull()
  })
})

const LEGACY = ['loyalty_hunts', 'loyalty_hunt_stops', 'loyalty_hunt_completions', 'loyalty_rewards', 'loyalty_stamps', 'season_challenges', 'challenge_qr_codes', 'challenge_progress', 'qr_codes']
const PLAY = ['hunt_runs', 'hunt_claims', 'hunt_progress', 'hunt_reward_grants', 'hunt_rewards', 'hunt_outbox']

describe('imports', () => {
  const legacyHunt = {
    id: 'legacy-1', slug: 'harbor-hop', hostSpaceId: 'space-1', hostSpaceName: 'Harbor Books', title: 'Harbor Hop', description: null,
    rewardTitle: 'Free tote', rewardValueCents: 1500,
    stops: [{ spaceName: 'Harbor Books', status: 'accepted' }, { spaceName: 'Salt Cafe', status: 'accepted' }, { spaceName: 'Tide Records', status: 'accepted' }],
  }

  it('reads a Regulars hunt through the owner-gated list, for its host Space only', async () => {
    mocks.listHuntsForSpace.mockResolvedValue([legacyHunt])
    const imported = await loadRegularsImport({ spaceId: 'space-1', legacyHuntId: 'legacy-1' })
    expect(imported?.draft.stops.map((s) => s.place)).toEqual(['Harbor Books', 'Salt Cafe', 'Tide Records'])
    expect(JSON.stringify(imported)).not.toContain('Free tote')
    // A Space that is only a stop on the hunt, and a gate that returned nothing, both import nothing.
    expect(await loadRegularsImport({ spaceId: 'space-2', legacyHuntId: 'legacy-1' })).toBeNull()
    mocks.listHuntsForSpace.mockResolvedValue([])
    expect(await loadRegularsImport({ spaceId: 'space-1', legacyHuntId: 'legacy-1' })).toBeNull()
    expect(writes).toEqual([])
  })

  it('reads a QR campaign and its code titles in the order they were added, and nothing but a qr_scan challenge', async () => {
    tables.season_challenges = [
      { id: 'ch-1', name: 'Mural Dash', description: null, criteria: { type: 'qr_scan' }, target: 2 },
      { id: 'ch-2', name: 'Streak', description: null, criteria: { type: 'streak' }, target: 7 },
    ]
    tables.challenge_qr_codes = [{ challenge_id: 'ch-1', qr_code_id: 'q2', created_at: 2 }, { challenge_id: 'ch-1', qr_code_id: 'q1', created_at: 1 }]
    tables.qr_codes = [{ id: 'q1', title: 'North mural', scan_count: 90 }, { id: 'q2', title: 'Dock mural', scan_count: 40 }]
    tables.challenge_progress = [{ challenge_id: 'ch-1', profile_id: 'p1', current: 2, completed_at: '2026-10-01' }]
    const imported = await loadQrCampaignImport('ch-1')
    expect(imported?.draft.stops.map((s) => s.place)).toEqual(['North mural', 'Dock mural'])
    expect(imported?.note).toMatchObject({ source: 'qr_campaign', sourceId: 'ch-1' })
    expect(JSON.stringify(imported)).not.toMatch(/p1|scan_count|2026-10-01/)
    expect(await loadQrCampaignImport('ch-2')).toBeNull()
    expect(await loadQrCampaignImport('missing')).toBeNull()
    expect(mocks.from.mock.calls.map((c) => c[0])).not.toContain('challenge_progress')
    expect(writes).toEqual([])
  })

  it('lands as one private draft and writes no legacy table, run, credit or reward', async () => {
    mocks.listHuntsForSpace.mockResolvedValue([legacyHunt])
    mocks.createTrailDraft.mockResolvedValue({ huntId: 'hunt-new', slug: 'harbor-hop-abc123' })
    tables.hunt_versions.push({ id: 'v-new', hunt_id: 'hunt-new', version_no: 1, status: 'draft', policy: {} })
    const imported = await loadRegularsImport({ spaceId: 'space-1', legacyHuntId: 'legacy-1' })
    expect(await createImportedDraft('owner', imported!)).toEqual({ huntId: 'hunt-new' })
    expect(mocks.createTrailDraft).toHaveBeenCalledWith({ ownerProfileId: 'owner', draft: imported!.draft })
    expect(tablesWritten()).toEqual(['hunt_versions'])
    expect(writes[0].filters).toEqual({ hunt_id: 'hunt-new', version_no: 1, status: 'draft' })
    const policy = tables.hunt_versions.find((v) => v.id === 'v-new')!.policy as Record<string, unknown>
    expect(Object.keys(policy).sort()).toEqual(['import', 'trail'])
    expect(policy.import).toMatchObject({ source: 'regulars', sourceId: 'legacy-1' })
    for (const t of [...LEGACY, ...PLAY]) expect(mocks.from.mock.calls.map((c) => c[0])).not.toContain(t)
  })

  it('is dark while authoring is off', async () => {
    vi.stubEnv('HUNTS_AUTHORING_ENABLED', '')
    expect(await loadRegularsImport({ spaceId: 'space-1', legacyHuntId: 'legacy-1' })).toBeNull()
    expect(await loadQrCampaignImport('ch-1')).toBeNull()
    expect(mocks.listHuntsForSpace).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

describe('readOldGrants', () => {
  beforeEach(() => {
    tables.hunts[0].current_version_id = 'v2'
    tables.hunt_versions[0] = { ...tables.hunt_versions[0], status: 'superseded', policy: { trail: {}, import: { source: 'regulars', sourceId: 'legacy-1', importedAt: '2026-08-01T00:00:00Z' } } }
    tables.hunt_versions[1].status = 'published'
    tables.hunt_rewards = [
      { id: 'r-spring', hunt_id: 'hunt-1', version_id: 'v1', title: 'Spring pin' },
      { id: 'r-summer', hunt_id: 'hunt-1', version_id: 'v2', title: 'Summer pin' },
      { id: 'r-void', hunt_id: 'hunt-1', version_id: 'v1', title: 'Taken back' },
    ]
    tables.hunt_reward_grants = [
      { hunt_id: 'hunt-1', reward_id: 'r-spring', profile_id: 'player', state: 'granted', granted_at: '2026-09-01T00:00:00Z' },
      { hunt_id: 'hunt-1', reward_id: 'r-summer', profile_id: 'player', state: 'granted', granted_at: '2026-11-01T00:00:00Z' },
      { hunt_id: 'hunt-1', reward_id: 'r-void', profile_id: 'player', state: 'revoked', granted_at: '2026-09-02T00:00:00Z' },
      { hunt_id: 'hunt-1', reward_id: 'r-spring', profile_id: 'someone-else', state: 'redeemed', granted_at: '2026-09-03T00:00:00Z' },
    ]
    tables.loyalty_rewards = [
      { hunt_id: 'legacy-1', profile_id: 'player', reward_title: 'Free tote', earned_at: '2026-06-01T00:00:00Z', redeemed_at: '2026-06-02T00:00:00Z' },
      { hunt_id: 'legacy-1', profile_id: 'someone-else', reward_title: 'Free tote', earned_at: '2026-06-03T00:00:00Z', redeemed_at: null },
      { hunt_id: 'legacy-9', profile_id: 'player', reward_title: 'Another hunt', earned_at: '2026-06-04T00:00:00Z', redeemed_at: null },
    ]
  })

  it("lists the member's own rewards from earlier editions and from the imported hunt, newest first", async () => {
    expect(await readOldGrants('player', 'hunt-1')).toEqual([
      { source: 'edition', title: 'Spring pin', earnedAt: '2026-09-01T00:00:00Z', state: 'held', editionNo: 1 },
      { source: 'regulars', title: 'Free tote', earnedAt: '2026-06-01T00:00:00Z', state: 'used', editionNo: null },
    ])
  })

  it('reads a finished QR campaign the Trail was imported from', async () => {
    tables.hunt_versions[0].policy = { trail: {}, import: { source: 'qr_campaign', sourceId: 'ch-1', importedAt: '2026-08-01T00:00:00Z' } }
    tables.season_challenges = [{ id: 'ch-1', name: 'Mural Dash' }]
    tables.challenge_progress = [
      { challenge_id: 'ch-1', profile_id: 'player', completed_at: '2026-07-01T00:00:00Z' },
      { challenge_id: 'ch-1', profile_id: 'someone-else', completed_at: '2026-07-02T00:00:00Z' },
    ]
    expect((await readOldGrants('player', 'hunt-1')).map((g) => [g.source, g.title, g.earnedAt])).toEqual([
      ['edition', 'Spring pin', '2026-09-01T00:00:00Z'],
      ['qr_campaign', 'Mural Dash', '2026-07-01T00:00:00Z'],
    ])
    expect(await readOldGrants('nobody', 'hunt-1')).toEqual([])
  })

  it('copies nothing: it is a read, and dark with the switch off', async () => {
    await readOldGrants('player', 'hunt-1')
    expect(writes).toEqual([])
    vi.stubEnv('HUNTS_ENABLED', '')
    expect(await readOldGrants('player', 'hunt-1')).toEqual([])
  })
})

// FH-044S: the release read before the tap, and a run's standing in the owner's 7 days to finish.
describe('previewRelease', () => {
  it('shows where each code goes, how many retire and how many runs stay behind, and writes nothing', async () => {
    expect(await previewRelease('hunt-1', actor)).toEqual({
      outgoingNo: 1,
      incomingNo: 2,
      moves: [{ place: 'Pier', from: 1, to: 2 }, { place: 'Bakery', from: 2, to: null }, { place: 'Library', from: 3, to: 1 }],
      retiredCodes: 1,
      pinnedRuns: 1,
      graceDays: 7,
    })
    expect(writes).toEqual([])
  })

  it('says the same as the release it previews', async () => {
    const preview = await previewRelease('hunt-1', actor)
    const out = await releaseEdition('hunt-1', actor, release)
    expect(out.ok && [out.retired.length, out.pinnedRuns]).toEqual([preview?.retiredCodes, preview?.pinnedRuns])
  })

  it('is null for a first publish, for a caller who may not publish, and while authoring is off', async () => {
    mocks.authorizeHuntAction.mockResolvedValueOnce({ id: 'hunt-1', ownerSpaceId: null, currentVersionId: null })
    expect(await previewRelease('hunt-1', actor)).toBeNull()
    mocks.authorizeHuntAction.mockResolvedValueOnce(null)
    expect(await previewRelease('hunt-1', actor)).toBeNull()
    vi.stubEnv('HUNTS_AUTHORING_ENABLED', '')
    expect(await previewRelease('hunt-1', actor)).toBeNull()
  })
})

describe('a run in flight at a release', () => {
  const released = (daysAgo: number) => {
    tables.hunt_versions[0] = { ...tables.hunt_versions[0], status: 'superseded', published_at: '2026-10-01T00:00:00Z' }
    tables.hunt_versions[1] = { ...tables.hunt_versions[1], status: 'published', published_at: new Date(Date.parse('2026-11-16T12:00:00Z') - daysAgo * 86_400_000).toISOString() }
    tables.hunts[0].current_version_id = 'v2'
  }
  const NOW = Date.parse('2026-11-16T12:00:00Z')

  it('is finishing for 7 days after the release, with the day it closes', async () => {
    released(3)
    const record = await loadRunRecord('player', 'run-old', NOW)
    expect(record).toMatchObject({ runId: 'run-old', standing: 'finishing', finishUntil: '2026-11-20T12:00:00.000Z', editionNo: 1 })
  })

  it('is a record once the 7 days have passed', async () => {
    released(8)
    expect(await loadRunRecord('player', 'run-old', NOW)).toMatchObject({ standing: 'record', finishUntil: null })
  })

  it('loadEarlierRun finds the member\'s run on an earlier edition, and nothing when every run is current', async () => {
    released(3)
    expect(await loadEarlierRun('player', 'hunt-1')).toMatchObject({ runId: 'run-old', editionNo: 1 })
    tables.hunts[0].current_version_id = 'v1'
    expect(await loadEarlierRun('player', 'hunt-1')).toBeNull()
  })
})
