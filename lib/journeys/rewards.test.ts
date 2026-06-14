import { describe, it, expect } from 'vitest'
import { buildJourneyTree, type BlockRow } from './tree'
import { rewardEventsForTransition } from './rewards'

const blocks: BlockRow[] = [
  { id: 'p1', parent_id: null, block_type: 'phase', sort_order: 0, title: 'Phase 1', required: true, est_minutes: null, practice_id: null },
  { id: 'l1', parent_id: 'p1', block_type: 'video', sort_order: 0, title: 'A', required: true, est_minutes: null, practice_id: null },
  { id: 'l2', parent_id: 'p1', block_type: 'reading', sort_order: 1, title: 'B', required: true, est_minutes: null, practice_id: null },
  { id: 'p2', parent_id: null, block_type: 'phase', sort_order: 1, title: 'Phase 2', required: true, est_minutes: null, practice_id: null },
  { id: 'l3', parent_id: 'p2', block_type: 'exercise', sort_order: 0, title: 'C', required: true, est_minutes: null, practice_id: null },
]
const tree = (done: string[]) => buildJourneyTree(blocks, done)
const fire = (beforeDone: string[], afterDone: string[]) =>
  rewardEventsForTransition({ profileId: 'u1', planId: 'pl1', before: tree(beforeDone), after: tree(afterDone) })

describe('journey reward firing (ADR-252)', () => {
  it('fires a phase_complete when a phase just finished', () => {
    const ev = fire(['l1'], ['l1', 'l2'])
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ kind: 'phase_complete', phaseId: 'p1' })
    expect(ev[0].idempotencyKey).toBe('journey.phase.complete:u1:pl1:p1')
  })

  it('fires journey_complete (and the last phase) when the whole thing finishes', () => {
    const ev = fire(['l1', 'l2'], ['l1', 'l2', 'l3'])
    expect(ev.map((e) => e.kind).sort()).toEqual(['journey_complete', 'phase_complete'])
    expect(ev.find((e) => e.kind === 'journey_complete')?.idempotencyKey).toBe('journey.complete:u1:pl1')
  })

  it('does not re-fire an already-complete phase (idempotent transitions)', () => {
    expect(fire(['l1', 'l2'], ['l1', 'l2'])).toHaveLength(0) // no change
    // completing a lesson in phase 2 doesn't re-fire phase 1
    const ev = fire(['l1', 'l2'], ['l1', 'l2', 'l3'])
    expect(ev.filter((e) => e.phaseId === 'p1')).toHaveLength(0)
  })

  it('fires nothing on a mid-phase step', () => {
    expect(fire([], ['l1'])).toHaveLength(0) // phase 1 still has l2 left
  })
})
