import { describe, expect, it } from 'vitest'
import { HUNT_MANIFEST } from '@/lib/studio/entities/hunt'
import { canonicalContent, followStopKey, parseTrailDraft, planStopPlacements, publishChecklist, publishRows, stopMedium } from './draft'

// FH-031V: one stop proved at the finale Event's door, bound through a placement of medium `event`.

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
const P = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

describe('the finale stop on the draft (FH-031V)', () => {
  it('reads one stop key that names a stop on the draft, and nothing else', () => {
    expect(parseTrailDraft({ ...draft(), finaleStop: 'stop-3' }).finaleStop).toBe('stop-3')
    for (const bad of ['stop-4', 'stop-0', 'stop-01', 'Stop-1', 3, ['stop-1', 'stop-2'], null]) {
      expect(parseTrailDraft({ ...draft(), finaleStop: bad })).not.toHaveProperty('finaleStop')
    }
    // An older draft reads back with no new key.
    expect(Object.keys(parseTrailDraft(draft())).sort()).toEqual(['area', 'audience', 'hook', 'permissionConfirmed', 'routeTestedAtRevision', 'stops', 'title'])
  })

  it('refuses a finale stop with no finale Event, and one that names no stop', () => {
    const d = draft({ finaleStop: 'stop-3', stops: [stop(1), stop(2), { ...stop(3), placementReady: false }] })
    const without = publishChecklist(d, 4)
    expect(without.ok).toBe(false)
    expect(without.items.find((i) => i.code === 'stop_finale')).toMatchObject({ ok: false, stop: 2 })
    // The door is the proof, so the finale stop needs no printed code.
    const withEvent = publishChecklist(d, 4, { finale: true })
    expect(withEvent.ok).toBe(true)
    expect(withEvent.items.some((i) => i.code === 'stop_placement' && i.stop === 2)).toBe(false)
    const gone = publishChecklist(draft({ finaleStop: 'stop-7' }), 4, { finale: true })
    expect(gone.ok).toBe(false)
    expect(gone.items.find((i) => i.code === 'stop_finale' && i.stop === undefined)?.ok).toBe(false)
    expect(publishChecklist(draft(), 4, { finale: true }).ok).toBe(true)
  })

  it('needs the Event door mark at the finale stop and changes the content hash only when one is set', () => {
    const d = draft({ finaleStop: 'stop-2' })
    expect(publishRows(d).missions.map((m) => m.required_assurance)).toEqual(['signed_node', 'event_door', 'signed_node'])
    expect(canonicalContent(d)).not.toBe(canonicalContent(draft()))
    expect(stopMedium(d, 1)).toBe('event')
    expect(stopMedium(d, 0)).toBe('qr')
  })

  it('carries the pick with its stop through a move, and drops it with a removed stop', () => {
    expect(followStopKey('stop-2', [1, 0, 2])).toBe('stop-1')
    expect(followStopKey('stop-3', [0, 2])).toBe('stop-2')
    expect(followStopKey('stop-2', [0, 2])).toBeNull()
    expect(followStopKey(undefined, [0, 1])).toBeNull()
  })
})

describe('binding the finale stop at publish (FH-031V)', () => {
  const media = new Map([[P(1), 'qr'], [P(2), 'qr'], [P(3), 'event'], [P(4), 'qr']])
  const live = new Set(media.keys())

  it('reuses an Event door placement for the finale stop only, and a printed code for every other stop', () => {
    const d = draft({ finaleStop: 'stop-2', stops: [{ ...stop(1), placementId: P(1) }, { ...stop(2), placementId: P(2) }, { ...stop(3), placementId: P(3) }] })
    // stop-2 named a QR code, so it gets a new door; stop-3 named the old door, so it gets a new code.
    expect(planStopPlacements(d, { live, bound: [], media })).toEqual([P(1), null, null])
    expect(planStopPlacements(d, { live, bound: [{ mission_key: 'stop-2', placement_id: P(3) }], media })).toEqual([P(1), P(3), null])
  })

  it('keeps the FH-020X plan when the media are not given', () => {
    const d = draft({ stops: [{ ...stop(1), placementId: P(1) }, { ...stop(2), placementId: P(3) }, stop(3)] })
    expect(planStopPlacements(d, { live, bound: [] })).toEqual([P(1), P(3), null])
  })

  it('offers the finale stop as one pick from the draft stops, never a stop switch', () => {
    const field = HUNT_MANIFEST.fields.find((f) => f.path === 'finaleStop')
    expect(field).toMatchObject({ kind: 'select', optionsFrom: 'trailStops', section: 'publishing' })
    expect(HUNT_MANIFEST.repeats?.find((r) => r.arrayPath === 'stops')?.fields.some((f) => f.path === 'finaleStop')).toBe(false)
  })
})
