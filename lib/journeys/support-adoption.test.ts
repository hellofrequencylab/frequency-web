import { describe, expect, it } from 'vitest'
import { automaticallyAdoptsPractice, computeLegTargets, type BlockRowWithSettings } from './leg-targets'
import { personalJourneyRows } from './support-template'

function blocks(): BlockRowWithSettings[] {
  return [
    { id: 'phase', parent_id: null, block_type: 'phase', sort_order: 0, title: 'Week', required: true, est_minutes: null, practice_id: null },
    ...personalJourneyRows({ mind: 'm', body: 'b', spirit: 's', expression: 'e' }).map((row, index) => ({
      id: `row-${index}`, parent_id: 'phase', block_type: row.block_type!, sort_order: index, title: row.title ?? null, required: row.required ?? null, est_minutes: null,
      practice_id: row.block_type === 'practice' ? `practice-${index}` : null,
      settings: row.settings as BlockRowWithSettings['settings'],
    })),
  ]
}

describe('prospective optional support adoption', () => {
  it('uses real new template rows but auto-adopts only the anchor', () => {
    const result = computeLegTargets(blocks(), null, 0)
    expect(result.targetIds).toEqual(['practice-0'])
    expect(result.anchorIds).toEqual(['practice-0'])
  })
  it('preserves legacy optional adoption rather than changing all optional blocks', () => {
    const rows = blocks()
    rows[2].settings = null
    expect(computeLegTargets(rows, null, 0).targetIds).toEqual(['practice-0', 'practice-1'])
  })
  it('includes a new suggestion if the author deliberately makes it required', () => {
    const rows = blocks()
    rows[2].required = true
    expect(computeLegTargets(rows, null, 0).targetIds).toEqual(['practice-0', 'practice-1'])
  })
  it('honors an explicit Anchor choice even for a formerly optional suggestion', () => {
    const rows = blocks()
    rows[2].settings = { support_suggestion: true, anchor: true }
    expect(computeLegTargets(rows, null, 0).anchorIds).toEqual(['practice-0', 'practice-1'])
    expect(computeLegTargets(rows, null, 0).targetIds).toEqual(['practice-0', 'practice-1'])
  })
  it('keeps an optional support visible in the tree but not in automatic current-leg targets', () => {
    const rows = blocks()
    expect(rows.some((row) => row.practice_id === 'practice-1')).toBe(true)
    expect(computeLegTargets(rows, new Date(), 7).targetIds).not.toContain('practice-1')
  })
  it('does not treat a malformed or absent marker as a prospective opt-out', () => {
    expect(automaticallyAdoptsPractice({ required: false, settings: null })).toBe(true)
    expect(automaticallyAdoptsPractice({ required: null, settings: { support_suggestion: true } })).toBe(true)
    expect(automaticallyAdoptsPractice({ required: false, settings: { support_suggestion: 'true' } as never })).toBe(true)
  })
})
