// FH-044: the three guarantees an edition makes, on the pure half. Existing runs keep their rules,
// printed codes follow their place, and an import carries a hunt's shape and nobody's progress.
// The database pins run under pgTAP in supabase/tests/hunt_editions.test.sql.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_STOPS, parseTrailDraft, publishChecklist } from './draft'
import {
  buildCrosswalk, carryBindings, importQrCampaign, importRegularsHunt, parseEditionNote, parseImportNote, runStanding, sortOldGrants,
  type Binding, type OldGrant,
} from './editions'

const places = (...names: string[]) => names.map((place) => ({ place }))
const binding = (missionKey: string, placementId: string): Binding => ({ missionKey, placementId, venueSpaceId: null, evidencePolicy: {} })

describe('printed codes follow their place', () => {
  it('an unchanged trail maps every stop to itself', () => {
    expect(buildCrosswalk(places('Pier', 'Bakery', 'Library'), places('Pier', 'Bakery', 'Library')))
      .toEqual({ 'stop-1': 'stop-1', 'stop-2': 'stop-2', 'stop-3': 'stop-3' })
  })

  it('a reordered trail repoints each sign at its own place, not at whichever stop took its number', () => {
    const crosswalk = buildCrosswalk(places('Pier', 'Bakery', 'Library'), places('Library', 'Pier', 'Bakery'))
    expect(crosswalk).toEqual({ 'stop-1': 'stop-2', 'stop-2': 'stop-3', 'stop-3': 'stop-1' })
    const { carried, retired } = carryBindings([binding('stop-1', 'sign-pier'), binding('stop-2', 'sign-bakery'), binding('stop-3', 'sign-library')], crosswalk)
    expect(carried.map((b) => [b.placementId, b.missionKey])).toEqual([['sign-pier', 'stop-2'], ['sign-bakery', 'stop-3'], ['sign-library', 'stop-1']])
    expect(retired).toEqual([])
  })

  it('a dropped place retires its sign instead of crediting the stop that replaced it', () => {
    const crosswalk = buildCrosswalk(places('Pier', 'Bakery', 'Library'), places('Pier', 'Museum', 'Library'))
    expect(crosswalk).toEqual({ 'stop-1': 'stop-1', 'stop-2': null, 'stop-3': 'stop-3' })
    const { carried, retired } = carryBindings([binding('stop-1', 'sign-pier'), binding('stop-2', 'sign-bakery'), binding('stop-3', 'sign-library')], crosswalk)
    expect(carried.map((b) => b.placementId)).toEqual(['sign-pier', 'sign-library'])
    expect(retired).toEqual(['sign-bakery'])
  })

  it('matches a place however it was typed, and keeps the order of two places with one name', () => {
    expect(buildCrosswalk(places(' the  PIER ', 'Bench', 'Bench'), places('Bench', 'The Pier', 'Bench')))
      .toEqual({ 'stop-1': 'stop-2', 'stop-2': 'stop-1', 'stop-3': 'stop-3' })
  })

  it('a stop with no name, and a binding outside the crosswalk, never carry', () => {
    expect(buildCrosswalk(places('', 'Pier'), places('', 'Pier'))).toEqual({ 'stop-1': null, 'stop-2': 'stop-2' })
    expect(carryBindings([binding('stop-9', 'sign-stray')], { 'stop-1': 'stop-1' })).toEqual({ carried: [], retired: ['sign-stray'] })
  })

  it('carries a sign bound to two stops when either place survives, with its venue and evidence policy', () => {
    const held: Binding = { missionKey: 'stop-1', placementId: 'sign-a', venueSpaceId: 'space-1', evidencePolicy: { hold_for_review: true } }
    const out = carryBindings([held, binding('stop-2', 'sign-a')], { 'stop-1': 'stop-3', 'stop-2': null })
    expect(out).toEqual({ carried: [{ ...held, missionKey: 'stop-3' }], retired: [] })
  })
})

describe('existing runs keep their rules', () => {
  it('a run on the current edition plays; a run on an earlier one is a record', () => {
    expect(runStanding({ versionId: 'v2', state: 'active' }, { currentVersionId: 'v2' })).toBe('playing')
    expect(runStanding({ versionId: 'v1', state: 'active' }, { currentVersionId: 'v2' })).toBe('record')
    expect(runStanding({ versionId: 'v2', state: 'completed' }, { currentVersionId: 'v2' })).toBe('record')
  })

  it('the migration pins a run to its edition and freezes a published edition', () => {
    const sql = readFileSync(join('supabase', 'migrations', '20270346082000_hunt_teams_editions.sql'), 'utf8').toLowerCase()
    expect(sql).toContain('before update on public.hunt_runs')
    expect(sql).toContain('if new.version_id is distinct from old.version_id or new.hunt_id is distinct from old.hunt_id then')
    expect(sql).toContain('before update on public.hunt_versions')
    expect(sql).toContain("(new.policy -> 'trail') is distinct from (old.policy -> 'trail')")
    expect(sql).toContain("(old.status = 'superseded' and new.status <> 'superseded')")
  })

  it('reads an edition note off stored jsonb and drops anything that is not a stop key', () => {
    expect(parseEditionNote({ label: 'Summer', previousVersionId: 'v1', crosswalk: { 'stop-1': 'stop-2', 'stop-2': null, evil: 'stop-1', 'stop-3': 7 } }))
      .toEqual({ label: 'Summer', previousVersionId: 'v1', crosswalk: { 'stop-1': 'stop-2', 'stop-2': null } })
    expect(parseEditionNote(null)).toBeNull()
    expect(parseEditionNote({ crosswalk: {} })).toBeNull()
  })
})

const regulars = {
  id: 'legacy-hunt-1',
  title: 'Harbor Hop',
  description: 'Five shops, one afternoon.',
  hostSpaceName: 'Harbor Books',
  stops: [
    { spaceName: 'Harbor Books', status: 'accepted' as const },
    { spaceName: 'Salt Cafe', status: 'accepted' as const },
    { spaceName: 'Maybe Later', status: 'invited' as const },
    { spaceName: 'No Thanks', status: 'declined' as const },
    { spaceName: 'Tide Records', status: 'accepted' as const },
  ],
  // What a real Regulars hunt also carries. None of it is part of the import's input type.
  rewardTitle: 'Free tote', rewardValueCents: 1500, completions: [{ profileId: 'p1', code: 'ABC123' }], stamps: 42,
}
const campaign = {
  id: 'challenge-1', name: 'Mural Dash', description: null, target: 2,
  codes: [{ title: 'North mural' }, { title: 'Dock mural' }, { title: 'Alley mural' }],
  zaps_reward: 50, scans: [{ profileId: 'p1' }], progress: [{ profileId: 'p1', current: 2, completed_at: '2026-10-01' }],
}

describe('imports carry no real credits', () => {
  it('a Regulars hunt becomes an unpublished draft of its accepted stops', () => {
    const { draft, note } = importRegularsHunt(regulars, '2026-11-16T00:00:00Z')
    expect(draft.title).toBe('Harbor Hop')
    expect(draft.area).toBe('Harbor Books')
    expect(draft.stops.map((s) => s.place)).toEqual(['Harbor Books', 'Salt Cafe', 'Tide Records'])
    expect(note).toEqual({ source: 'regulars', sourceId: 'legacy-hunt-1', importedAt: '2026-11-16T00:00:00Z' })
  })

  it('a QR campaign becomes an unpublished draft of its codes, and says the any-N rule was not carried', () => {
    const { draft, note, notices } = importQrCampaign(campaign, '2026-11-16T00:00:00Z')
    expect(draft.stops.map((s) => s.place)).toEqual(['North mural', 'Dock mural', 'Alley mural'])
    expect(note.source).toBe('qr_campaign')
    expect(notices.join(' ')).toContain('any 2 of 3 codes')
  })

  it.each([
    ['Regulars', () => importRegularsHunt(regulars, '2026-11-16T00:00:00Z')],
    ['QR campaign', () => importQrCampaign(campaign, '2026-11-16T00:00:00Z')],
  ])('a %s import holds no reward, stamp, scan, completion or member id anywhere', (_name, run) => {
    const out = run()
    // The notices are fixed sentences for the author; the data that is stored is the draft and the note.
    const text = JSON.stringify({ draft: out.draft, note: out.note })
    for (const leaked of ['Free tote', '1500', 'ABC123', 'p1', 'zaps', 'completed_at', 'stamps', 'scans', 'reward']) expect(text).not.toContain(leaked)
    expect(Object.keys(out).sort()).toEqual(['draft', 'note', 'notices'])
    expect(Object.keys(out.draft).sort()).toEqual(['area', 'audience', 'hook', 'permissionConfirmed', 'routeTestedAtRevision', 'stops', 'title'])
    expect(Object.keys(out.note).sort()).toEqual(['importedAt', 'source', 'sourceId'])
  })

  it.each([
    ['Regulars', () => importRegularsHunt(regulars, '2026-11-16T00:00:00Z').draft],
    ['QR campaign', () => importQrCampaign(campaign, '2026-11-16T00:00:00Z').draft],
  ])('a %s import cannot publish as it lands: no clue, no placed code, no route test, no permission', (_name, run) => {
    const draft = run()
    expect(draft.stops.every((s) => s.clue === '' && s.placementReady === false)).toBe(true)
    expect(draft.routeTestedAtRevision).toBeNull()
    expect(draft.permissionConfirmed).toBe(false)
    expect(publishChecklist(draft, 1).ok).toBe(false)
    // It is a well-formed draft: the store's own parser reads it back unchanged.
    expect(parseTrailDraft(draft)).toEqual(draft)
  })

  it('keeps to the stop limit and tells the author what was left out', () => {
    const many = { ...campaign, target: 12, codes: Array.from({ length: 12 }, (_, i) => ({ title: `Code ${i + 1}` })) }
    const { draft, notices } = importQrCampaign(many, '2026-11-16T00:00:00Z')
    expect(draft.stops).toHaveLength(MAX_STOPS)
    expect(notices.join(' ')).toContain('the last 2 places were left out')
    expect(notices.join(' ')).not.toMatch(/—|–/)
  })

  it('reads an import note off stored jsonb, or nothing', () => {
    expect(parseImportNote({ source: 'regulars', sourceId: 'x', importedAt: 't', extra: 1 })).toEqual({ source: 'regulars', sourceId: 'x', importedAt: 't' })
    expect(parseImportNote({ source: 'other', sourceId: 'x', importedAt: 't' })).toBeNull()
    expect(parseImportNote(undefined)).toBeNull()
  })
})

describe('old grants', () => {
  it('lists newest first whatever the source', () => {
    const grants: OldGrant[] = [
      { source: 'regulars', title: 'Free tote', earnedAt: '2026-06-01T00:00:00Z', state: 'used', editionNo: null },
      { source: 'edition', title: 'Spring pin', earnedAt: '2026-09-01T00:00:00Z', state: 'held', editionNo: 1 },
      { source: 'qr_campaign', title: 'Mural Dash', earnedAt: '2026-07-01T00:00:00Z', state: 'used', editionNo: null },
    ]
    expect(sortOldGrants(grants).map((g) => g.title)).toEqual(['Spring pin', 'Mural Dash', 'Free tote'])
    expect(grants[0].title).toBe('Free tote')
  })
})
