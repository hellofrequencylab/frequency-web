import { describe, expect, it } from 'vitest'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import { benefitCodeFrom, benefitsReady, canonicalContent, draftToGraph, evidencePolicyUpdates, parseTrailDraft, previewTrail, publishChecklist, publishRows, publishedPolicy, saveDraft, stopEvidencePolicy, stopKey } from './draft'
import { versionBenefits } from './benefit-codes'
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
    expect(fields.map((f) => f.kind).sort()).toEqual(['longtext', 'text', 'text', 'toggle', 'toggle'])
    expect(fields.some((f) => /policy|json/i.test(f.path))).toBe(false)
  })
  it('keeps every manifest stop field through a save', () => {
    const filled = Object.fromEntries(fields.map((f) => [f.path, f.kind === 'toggle' ? true : 'x']))
    expect(Object.keys(parseTrailDraft({ stops: [filled] }).stops[0]).sort()).toEqual(fields.map((f) => f.path).sort())
  })
})

// FH-036S: what a paid pass includes is authored on the trail and published with its version.
describe('pass benefits on a draft', () => {
  const benefits = [{ label: 'Tasting flight', code: 'tasting-flight' }, { label: 'Dessert course', code: 'dessert' }]

  it('a trail with no benefits is stored and hashed exactly as before', () => {
    expect('benefits' in parseTrailDraft(draft())).toBe(false)
    expect('benefits' in parseTrailDraft({ ...draft(), benefits: [] })).toBe(false)
    expect(canonicalContent(draft({ benefits: [] }))).toBe(canonicalContent(draft()))
    expect(publishChecklist(draft(), 4).items.some((i) => i.code === 'benefits')).toBe(false)
  })

  it('keeps a half-typed benefit while drafting, caps the list at ten and lowercases a code', () => {
    const parsed = parseTrailDraft({ ...draft(), benefits: [{ label: 'Tasting', code: 'TASTING' }, { label: 'Half typed' }, 'junk', ...Array.from({ length: 12 }, () => ({ label: 'x', code: 'x' }))] })
    expect(parsed.benefits).toHaveLength(10)
    expect(parsed.benefits?.slice(0, 3)).toEqual([{ label: 'Tasting', code: 'tasting' }, { label: 'Half typed', code: '' }, { label: '', code: '' }])
  })

  it('blocks publishing until every benefit has a name and its own valid code', () => {
    expect(publishChecklist(draft({ benefits }), 4).ok).toBe(true)
    for (const bad of [[{ label: 'Tasting', code: '' }], [{ label: '', code: 'tasting' }], [{ label: 'A', code: 'Not A Code' }], [benefits[0], { label: 'Again', code: 'tasting-flight' }]]) {
      const list = publishChecklist(draft({ benefits: bad }), 4)
      expect(list.ok).toBe(false)
      expect(list.items.find((i) => i.code === 'benefits')?.ok).toBe(false)
    }
    expect(benefitsReady(benefits)).toBe(true)
  })

  it('a changed benefit is a material change to the published content', () => {
    const a = canonicalContent(draft({ benefits }))
    expect(a).not.toBe(canonicalContent(draft()))
    expect(canonicalContent(draft({ benefits: [benefits[0]] }))).not.toBe(a)
  })

  it('publishes them where a pass binding reads them, and publishes none for a trail without any', () => {
    const policy = publishedPolicy({ trail: {}, other: 1 }, draft({ benefits }))
    expect(versionBenefits(policy)).toEqual([{ code: 'tasting-flight', label: 'Tasting flight' }, { code: 'dessert', label: 'Dessert course' }])
    expect(policy.other).toBe(1)
    expect('benefits' in publishedPolicy({ benefits: [{ code: 'old', label: 'Old' }] }, draft())).toBe(false)
  })

  it('offers a short code from the name', () => {
    expect(benefitCodeFrom('Tasting flight')).toBe('tasting-flight')
    expect(benefitCodeFrom('  2 for 1 Dessert!  ')).toBe('for-1-dessert')
    expect(benefitCodeFrom('!!!')).toBe('')
  })
})
