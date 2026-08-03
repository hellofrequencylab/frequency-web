import { describe, it, expect } from 'vitest'
import { computeLegTargets, type BlockRowWithSettings } from './leg-targets'

// A 3-phase journey: anchor practice A in phase 1; weekly practices P1/P2/P3 one per phase.
function blocks(): BlockRowWithSettings[] {
  const rows: BlockRowWithSettings[] = []
  for (let i = 0; i < 3; i++) {
    rows.push({
      id: `phase-${i}`, parent_id: null, block_type: 'phase', sort_order: i,
      title: `Week ${i + 1}`, required: true, est_minutes: null, practice_id: null, settings: null,
    })
    rows.push({
      id: `p-${i}`, parent_id: `phase-${i}`, block_type: 'practice', sort_order: 0,
      title: `Practice ${i + 1}`, required: true, est_minutes: null, practice_id: `P${i + 1}`,
      settings: null,
    })
  }
  // The Anchor rides phase 1 (settings.anchor), practice id A.
  rows.push({
    id: 'anchor', parent_id: 'phase-0', block_type: 'practice', sort_order: 1,
    title: 'Anchor', required: true, est_minutes: null, practice_id: 'A',
    settings: { anchor: true },
  })
  return rows
}

const DAY = 86_400_000

describe('computeLegTargets (ADR-920 Phase 2)', () => {
  it('week 1: phase-1 practices + the anchor', () => {
    const start = new Date(Date.now() - 1 * DAY)
    const t = computeLegTargets(blocks(), start, 7)
    expect(t.week).toBe(1)
    expect(t.weeks).toBe(3)
    expect([...t.targetIds].sort()).toEqual(['A', 'P1'])
    expect(t.anchorIds).toEqual(['A'])
  })

  it('week 2: the anchor PERSISTS while phase 1 practices step back', () => {
    const start = new Date(Date.now() - 8 * DAY)
    const t = computeLegTargets(blocks(), start, 7)
    expect(t.week).toBe(2)
    expect([...t.targetIds].sort()).toEqual(['A', 'P2'])
  })

  it('the final week clamps and still carries the anchor', () => {
    const start = new Date(Date.now() - 100 * DAY)
    const t = computeLegTargets(blocks(), start, 7)
    expect(t.week).toBe(3)
    expect([...t.targetIds].sort()).toEqual(['A', 'P3'])
  })

  it('no anchor date (or no drip) = every week open, week null', () => {
    const open = computeLegTargets(blocks(), null, 7)
    expect(open.week).toBeNull()
    expect([...open.targetIds].sort()).toEqual(['A', 'P1', 'P2', 'P3'])
    const noDrip = computeLegTargets(blocks(), new Date(), 0)
    expect(noDrip.week).toBeNull()
  })

  it('an empty plan yields nothing', () => {
    expect(computeLegTargets([], new Date(), 7)).toEqual({ targetIds: [], anchorIds: [], week: null, weeks: 0 })
  })

  it('a duplicated anchor practice id is de-duped', () => {
    const rows = blocks()
    rows.push({
      id: 'anchor-2', parent_id: 'phase-1', block_type: 'practice', sort_order: 2,
      title: 'Anchor again', required: true, est_minutes: null, practice_id: 'A',
      settings: { anchor: true },
    })
    const t = computeLegTargets(rows, new Date(Date.now() - 1 * DAY), 7)
    expect(t.anchorIds).toEqual(['A'])
  })
})
