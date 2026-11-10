import { describe, expect, it } from 'vitest'
import { draftToGraph, previewTrail, publishChecklist, saveDraft, stopKey } from './draft'
import { validateGraph } from './graph'

type Draft = Parameters<typeof publishChecklist>[0]

const stop = (n: number) => ({ place: `Place ${n}`, clue: `Clue ${n}`, placementReady: true })
const draft = (over: Partial<Draft> = {}): Draft => ({
  title: 'Harbor walk',
  hook: 'Three stops, one story',
  area: 'Carlsbad',
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
