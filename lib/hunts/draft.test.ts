import { describe, expect, it } from 'vitest'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import { canonicalContent, draftToGraph, evidencePolicyUpdates, parseTrailDraft, previewTrail, publishChecklist, publishPolicy, publishRows, reorderStops, saveDraft, stopEvidencePolicy, stopKey } from './draft'
import { validateGraph } from './graph'

type Draft = Parameters<typeof publishChecklist>[0]

const stop = (n: number) => ({ place: `Place ${n}`, clue: `Clue ${n}`, placementReady: true })
const draft = (over: Partial<Draft> = {}): Draft => ({
  title: 'Harbor walk',
  hook: 'Three stops, one story',
  area: 'Carlsbad',
  audience: 'Anyone with an afternoon',
  stops: [stop(1), stop(2), stop(3)],
  routeTestedAtRevision: 4,
  permissionConfirmed: true,
  ...over,
})

describe('draftToGraph', () => {
  it('chains the stops in order and finishes at the last', () => {
    const g = draftToGraph(draft())
    expect(g.missions.map((m) => m.mission_key)).toEqual(['stop-1', 'stop-2', 'stop-3'])
    expect(g.missions[1].rule_groups[0].members).toEqual(['stop-1'])
    expect(g.finish.rule_groups[0].members).toEqual(['stop-3'])
    expect(validateGraph(g).ok).toBe(true)
  })
})

describe('previewTrail', () => {
  it('unlocks one stop at a time and finishes after the last', () => {
    const d = draft()
    expect(previewTrail(d, []).eligible).toEqual(['stop-1'])
    expect(previewTrail(d, [stopKey(0)]).eligible).toEqual(['stop-2'])
    expect(previewTrail(d, [stopKey(0), stopKey(1)]).finished).toBe(false)
    expect(previewTrail(d, [stopKey(0), stopKey(1), stopKey(2)]).finished).toBe(true)
  })
})

describe('publishChecklist', () => {
  it('passes a complete draft tested on this revision', () => {
    expect(publishChecklist(draft(), 4).ok).toBe(true)
  })

  it('blocks on each missing piece', () => {
    expect(publishChecklist(draft({ stops: [stop(1), stop(2)] }), 4).items.find((i) => i.code === 'stops_count')?.ok).toBe(false)
    expect(publishChecklist(draft({ title: ' ' }), 4).ok).toBe(false)
    expect(publishChecklist(draft({ permissionConfirmed: false }), 4).ok).toBe(false)
    expect(publishChecklist(draft({ stops: [stop(1), { ...stop(2), clue: '' }, stop(3)] }), 4).ok).toBe(false)
    expect(publishChecklist(draft({ stops: [stop(1), { ...stop(2), placementReady: false }, stop(3)] }), 4).ok).toBe(false)
  })

  it('wants the route test on the current revision', () => {
    expect(publishChecklist(draft({ routeTestedAtRevision: 3 }), 4).items.find((i) => i.code === 'route_test')?.ok).toBe(false)
    expect(publishChecklist(draft({ routeTestedAtRevision: null }), 4).ok).toBe(false)
  })
})

describe('saveDraft', () => {
  const memory = (start: number) => {
    let revision = start
    return {
      writes: 0,
      get revision() {
        return revision
      },
      async update(_id: string, base: number) {
        if (base !== revision) return { applied: false as const, currentRevision: revision }
        revision += 1
        this.writes += 1
        return { applied: true as const, revision }
      },
    }
  }

  it('applies on the current revision and clears the route test', async () => {
    const store = memory(4)
    let saved: Draft | null = null
    const res = await saveDraft({ update: async (id, b, d) => ((saved = d), store.update(id, b)) }, { huntId: 'h', baseRevision: 4, draft: draft() })
    expect(res).toEqual({ ok: true, revision: 5 })
    expect(saved!.routeTestedAtRevision).toBeNull()
  })

  it('refuses a stale tab and writes nothing', async () => {
    const store = memory(4)
    const first = await saveDraft(store, { huntId: 'h', baseRevision: 4, draft: draft() })
    const stale = await saveDraft(store, { huntId: 'h', baseRevision: 4, draft: draft({ title: 'Other tab' }) })
    expect(first.ok).toBe(true)
    expect(stale).toEqual({ ok: false, conflict: true, currentRevision: 5 })
    expect(store.writes).toBe(1)
  })
})

describe('parseTrailDraft', () => {
  it('reads an untrusted object into a capped draft and never trusts a forged route test', () => {
    const d = parseTrailDraft({
      title: 'x'.repeat(500),
      stops: Array.from({ length: 14 }, (_, i) => ({ place: `P${i}`, clue: 'c', placementReady: 'yes' })),
      routeTestedAtRevision: '7',
      permissionConfirmed: 'true',
    })
    expect(d.title).toHaveLength(120)
    expect(d.stops).toHaveLength(10)
    expect(d.stops[0].placementReady).toBe(false)
    expect(d.routeTestedAtRevision).toBeNull()
    expect(d.permissionConfirmed).toBe(false)
    expect(parseTrailDraft(null).stops).toEqual([])
  })
})

describe('publishRows and canonicalContent', () => {
  it('derives one mission per stop and the prerequisite groups from the Trail shape', () => {
    const rows = publishRows(draft())
    expect(rows.missions.map((m) => m.mission_key)).toEqual(['stop-1', 'stop-2', 'stop-3'])
    expect(rows.missions[0].title).toBe('Place 1')
    expect(rows.groups.map((g) => g.key)).toEqual(['stop-2:needs', 'stop-3:needs', 'finish'])
    expect(rows.groups[2].members).toEqual(['stop-3'])
  })

  it('is stable for the same content and changes with any material edit', () => {
    const a = canonicalContent(draft())
    expect(canonicalContent(draft({ routeTestedAtRevision: 9 }))).toBe(a)
    expect(canonicalContent(draft({ stops: [stop(1), stop(2), { ...stop(3), clue: 'Other' }] }))).not.toBe(a)
  })
})

describe('the staff review opt-in on a stop (FH-020V)', () => {
  const held = () => draft({ stops: [stop(1), { ...stop(2), holdForReview: true }, stop(3)] })

  it('reads the switch as a strict boolean and leaves older drafts unchanged', () => {
    const parsed = parseTrailDraft({ stops: [{ place: 'A', clue: 'c', holdForReview: true }, { place: 'B', clue: 'c', holdForReview: 'true' }, { place: 'C', clue: 'c' }] })
    expect(parsed.stops.map((s) => s.holdForReview)).toEqual([true, undefined, undefined])
    expect(parsed.stops[2]).toEqual({ place: 'C', clue: 'c', hint: '', placementReady: false })
  })

  it('turns the switch into the one key the claim command reads', () => {
    expect(stopEvidencePolicy({ holdForReview: true })).toEqual({ hold_for_review: true })
    expect(stopEvidencePolicy({})).toEqual({})
    expect(stopEvidencePolicy(undefined)).toEqual({})
  })

  it('rewrites only the bindings whose policy differs, and keeps their other keys', () => {
    const bindings = [
      { mission_key: 'stop-1', placement_id: 'p1', evidence_policy: {} },
      { mission_key: 'stop-2', placement_id: 'p2', evidence_policy: { photo: 'optional' } },
      { mission_key: 'stop-2', placement_id: 'p2b', evidence_policy: { hold_for_review: true } },
      { mission_key: 'stop-3', placement_id: 'p3', evidence_policy: { hold_for_review: true, photo: 'optional' } },
      { mission_key: 'stop-3', placement_id: 'p3b', evidence_policy: { hold_for_review: 'true' } },
      { mission_key: 'stop-9', placement_id: 'p9', evidence_policy: { hold_for_review: true } },
      { mission_key: 'stop-1', placement_id: 'p1b', evidence_policy: null },
    ]
    expect(evidencePolicyUpdates(held(), bindings)).toEqual([
      { mission_key: 'stop-2', placement_id: 'p2', evidence_policy: { photo: 'optional', hold_for_review: true } },
      { mission_key: 'stop-3', placement_id: 'p3', evidence_policy: { photo: 'optional' } },
      { mission_key: 'stop-3', placement_id: 'p3b', evidence_policy: {} },
    ])
    expect(evidencePolicyUpdates(draft(), [bindings[0], bindings[1], bindings[6]])).toEqual([])
  })

  it('changes the content hash only when a stop opts in', () => {
    const plain = canonicalContent(draft())
    expect(plain).not.toContain('review_holds')
    expect(canonicalContent(draft({ stops: [stop(1), { ...stop(2), holdForReview: false }, stop(3)] }))).toBe(plain)
    expect(canonicalContent(held())).not.toBe(plain)
    expect(JSON.parse(canonicalContent(held())).review_holds).toEqual(['stop-2'])
  })
})

describe('the Hunt manifest and the draft agree on a stop (FH-020V)', () => {
  const fields = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'stops')?.fields ?? []
  it('offers the review opt-in as a switch, with no raw JSON or policy field', () => {
    expect(fields.find((f) => f.path === 'holdForReview')?.kind).toBe('toggle')
    expect(fields.map((f) => f.kind).sort()).toEqual(['longtext', 'text', 'text', 'toggle', 'toggle', 'toggle'])
    expect(fields.some((f) => /policy|json/i.test(f.path))).toBe(false)
  })
  it('keeps every manifest stop field through a save', () => {
    const filled = Object.fromEntries(fields.map((f) => [f.path, f.kind === 'toggle' ? true : 'x']))
    expect(Object.keys(parseTrailDraft({ stops: [filled] }).stops[0]).sort()).toEqual(fields.map((f) => f.path).sort())
  })
})

// FH-030S: count rules and regions authored through the draft.
describe('a Passport with a threshold, partner places and regions (FH-030S)', () => {
  const OWNER = '00000000-0000-4000-8000-0000000000aa'
  const CAFE = '00000000-0000-4000-8000-0000000000c1'
  const PARK = '00000000-0000-4000-8000-0000000000c2'
  const five = () => [1, 2, 3, 4, 5].map(stop)
  const passport = (over: Partial<Draft> = {}) => draft({ stops: five(), shape: 'passport', finishCount: 3, ...over })

  it('publishes a resident-built 3 of 5 Passport as one count group with min_count 3', () => {
    const d = passport()
    expect(publishChecklist(d, 4).ok).toBe(true)
    const rows = publishRows(d)
    expect(rows.groups).toEqual([{ key: 'finish', target_mission_key: null, target_finish: true, logic: 'count', min_count: 3, members: ['stop-1', 'stop-2', 'stop-3', 'stop-4', 'stop-5'] }])
    expect(previewTrail(d, ['stop-5', 'stop-2']).finished).toBe(false)
    expect(previewTrail(d, ['stop-5', 'stop-2', 'stop-4']).finished).toBe(true)
    expect(canonicalContent(d)).not.toBe(canonicalContent(draft({ stops: five() })))
  })

  it('counts every stop of a Space-run Passport, but two stops at one partner venue only once', () => {
    const atOwner = passport({ finishCount: 5, venues: five().map((_, i) => ({ stop: stopKey(i), venue: OWNER })) })
    expect(publishChecklist(atOwner, 4, { allowedVenues: new Set([OWNER]), ownerSpaceId: OWNER }).ok).toBe(true)
    const shared = passport({ finishCount: 5, venues: [{ stop: 'stop-1', venue: CAFE }, { stop: 'stop-2', venue: CAFE }] })
    const graph = publishChecklist(shared, 4, { allowedVenues: new Set([CAFE]) }).items.find((i) => i.code === 'graph')
    expect(graph?.ok).toBe(false)
    expect(graph?.message).toMatch(/^The Passport asks for more places than a player can visit\./)
    expect(graph?.message).not.toMatch(/stop-\d|Mission "/)
  })

  it('refuses a stop placed at a Space that is not this Hunt\'s or a live partner', () => {
    const d = passport({ venues: [{ stop: 'stop-2', venue: CAFE, substitute: PARK }] })
    const item = (allowed: string[]) => publishChecklist(d, 4, { allowedVenues: new Set(allowed) }).items.find((i) => i.code === 'stop_venue')
    expect(item([CAFE])).toMatchObject({ ok: false, stop: 1 })
    expect(item([CAFE, PARK])?.ok).toBe(true)
    // Unknown counts as none.
    expect(publishChecklist(d, 4).ok).toBe(false)
  })

  it('refuses a planned closure that breaks a region, and passes once a substitute keeps the stop open', () => {
    const regions = [{ name: 'Harbor', enabled: true, stops: ['stop-1', 'stop-2'] }, { name: 'Old town', enabled: true, stops: ['stop-3', 'stop-4', 'stop-5'] }]
    const d = passport({ finishCount: 2, regions, venues: [{ stop: 'stop-1', venue: CAFE }] })
    const allowedVenues = new Set([CAFE, PARK])
    expect(publishChecklist(d, 4, { allowedVenues }).ok).toBe(true)
    const leaving = publishChecklist(d, 4, { allowedVenues, closedVenues: new Set([CAFE]) })
    const closure = leaving.items.find((i) => i.code === 'venue_closure')
    expect(leaving.ok).toBe(false)
    expect(closure?.message).toContain('The region "Harbor" cannot be finished on its own.')
    const covered = { ...d, venues: [{ stop: 'stop-1', venue: CAFE, substitute: PARK }] }
    expect(publishChecklist(covered, 4, { allowedVenues, closedVenues: new Set([CAFE]) }).ok).toBe(true)
  })

  it('writes the regions as the version chapters, a region switched off included', () => {
    const d = passport({ finishCount: 2, regions: [{ name: 'Harbor', enabled: true, stops: ['stop-1', 'stop-2', 'stop-3'] }, { name: 'Pier', enabled: false, stops: ['stop-4'] }] })
    expect(publishPolicy(d)).toEqual({
      chapters: [
        { chapter_key: 'region-1', enabled: true, members: ['stop-1', 'stop-2', 'stop-3'] },
        { chapter_key: 'region-2', enabled: false, members: ['stop-4'] },
      ],
    })
    expect(publishChecklist(d, 4).ok).toBe(true)
    expect(previewTrail(d, []).status['stop-4']).toBe('closed')
    expect(publishPolicy(draft())).toEqual({})
  })

  it('reads the new keys off untrusted input and leaves an older draft unchanged', () => {
    const parsed = parseTrailDraft({
      stops: five(),
      shape: 'passport',
      finishCount: 3,
      venues: [{ stop: 'stop-2', venue: CAFE.toUpperCase(), substitute: CAFE }, { stop: 'stop-9', venue: PARK }, { stop: 'stop-3', venue: 'not-a-space' }, { stop: 'stop-2', venue: PARK }],
      regions: [{ name: 'Harbor', enabled: 'true', stops: ['stop-1', 'stop-1', 'stop-42'] }],
    })
    expect(parsed.shape).toBe('passport')
    expect(parsed.finishCount).toBe(3)
    expect(parsed.venues).toEqual([{ stop: 'stop-2', venue: CAFE }])
    expect(parsed.regions).toEqual([{ name: 'Harbor', enabled: false, stops: ['stop-1'] }])
    const older = parseTrailDraft({ ...draft(), finishCount: 0, shape: 'maze' })
    expect(Object.keys(older).sort()).toEqual(['area', 'audience', 'hook', 'permissionConfirmed', 'routeTestedAtRevision', 'stops', 'title'])
  })

  it('moves a stop\'s place and region with it, and drops them with a removed stop', () => {
    const d = passport({ venues: [{ stop: 'stop-1', venue: CAFE }, { stop: 'stop-3', venue: PARK }], regions: [{ name: 'Harbor', enabled: true, stops: ['stop-1', 'stop-2'] }] })
    const moved = reorderStops(d, [1, 0, 2, 3, 4])
    expect(moved.stops[1].place).toBe('Place 1')
    expect(moved.venues).toEqual([{ stop: 'stop-2', venue: CAFE }, { stop: 'stop-3', venue: PARK }])
    expect(moved.regions?.[0].stops).toEqual(['stop-2', 'stop-1'])
    const removed = reorderStops(d, [1, 2, 3, 4])
    expect(removed.venues).toEqual([{ stop: 'stop-2', venue: PARK }])
    expect(removed.regions?.[0].stops).toEqual(['stop-1'])
  })

  it('offers the places and regions through the Hunt manifest, limited to the venues the editor loads', () => {
    const venueFields = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'venues')?.fields ?? []
    expect(venueFields.map((f) => [f.path, f.optionsFrom])).toEqual([['stop', 'hunt-stops'], ['venue', 'hunt-venues'], ['substitute', 'hunt-venues']])
    const regionFields = HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'regions')?.fields ?? []
    expect(regionFields.map((f) => f.kind)).toEqual(['text', 'toggle', 'multiselect'])
    expect(HUNT_MANIFEST.fields.find((f) => f.path === 'finishCount')?.kind).toBe('number')
  })
})
