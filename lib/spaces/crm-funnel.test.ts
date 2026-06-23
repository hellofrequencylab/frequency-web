import { describe, it, expect } from 'vitest'
import { computeConversionRate, buildFunnel } from './crm-funnel'
import type { CrmStage, CrmDeal } from '@/lib/crm/pipeline'

// PURE funnel derivation (ADR-381). What is locked here, all network-free (the pure helpers take plain
// data in, a plain snapshot out):
//   1. CONVERSION MATH: won / entered as a fraction; 0 (never NaN) when nothing entered; clamped to
//      [0, 1] so a malformed count can never report above 100%.
//   2. THE FOLD: stages keep their incoming order; each deal lands in its stage's count + value;
//      totals + won count + conversion are computed across every deal; a deal in no known stage still
//      counts toward the total + the conversion denominator but lands in no stage row.
//   3. EMPTY DATA: no stages + no deals -> all zeros, no divide-by-zero.

function stage(over: Partial<Pick<CrmStage, 'id' | 'name' | 'kind'>> = {}): Pick<CrmStage, 'id' | 'name' | 'kind'> {
  return { id: 's', name: 'Stage', kind: 'open', ...over }
}
function deal(over: Partial<Pick<CrmDeal, 'stage_id' | 'value' | 'status'>> = {}): Pick<CrmDeal, 'stage_id' | 'value' | 'status'> {
  return { stage_id: 's1', value: 0, status: 'open', ...over }
}

describe('computeConversionRate', () => {
  it('is won / entered as a fraction', () => {
    expect(computeConversionRate(2, 8)).toBeCloseTo(0.25, 10)
  })

  it('is 0 (never NaN) when nothing entered', () => {
    expect(computeConversionRate(0, 0)).toBe(0)
    expect(Number.isNaN(computeConversionRate(0, 0))).toBe(false)
  })

  it('clamps a malformed (more won than entered) count to 1', () => {
    expect(computeConversionRate(10, 4)).toBe(1)
  })

  it('clamps a negative count to 0 and ignores non-finite input', () => {
    expect(computeConversionRate(-3, 5)).toBe(0)
    expect(computeConversionRate(Number.NaN, 5)).toBe(0)
    expect(computeConversionRate(2, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('buildFunnel - empty data', () => {
  it('returns all zeros with no divide-by-zero', () => {
    const f = buildFunnel([], [])
    expect(f.stages).toEqual([])
    expect(f.totalDeals).toBe(0)
    expect(f.totalValue).toBe(0)
    expect(f.wonCount).toBe(0)
    expect(f.conversionRate).toBe(0)
    expect(Number.isNaN(f.conversionRate)).toBe(false)
  })

  it('returns zeroed stage rows when there are stages but no deals', () => {
    const f = buildFunnel([stage({ id: 's1', name: 'New' }), stage({ id: 's2', name: 'Won', kind: 'won' })], [])
    expect(f.stages.map((s) => ({ id: s.id, count: s.count, value: s.value }))).toEqual([
      { id: 's1', count: 0, value: 0 },
      { id: 's2', count: 0, value: 0 },
    ])
    expect(f.conversionRate).toBe(0)
  })
})

describe('buildFunnel - normal conversion', () => {
  const stages = [
    stage({ id: 's1', name: 'New', kind: 'open' }),
    stage({ id: 's2', name: 'In progress', kind: 'open' }),
    stage({ id: 's3', name: 'Won', kind: 'won' }),
    stage({ id: 's4', name: 'Lost', kind: 'lost' }),
  ]
  const deals = [
    deal({ stage_id: 's1', value: 100, status: 'open' }),
    deal({ stage_id: 's1', value: 200, status: 'open' }),
    deal({ stage_id: 's2', value: 300, status: 'open' }),
    deal({ stage_id: 's3', value: 500, status: 'won' }),
    deal({ stage_id: 's4', value: 50, status: 'lost' }),
  ]

  it('keeps stage order and counts each deal into its stage', () => {
    const f = buildFunnel(stages, deals)
    expect(f.stages.map((s) => s.name)).toEqual(['New', 'In progress', 'Won', 'Lost'])
    expect(f.stages.map((s) => s.count)).toEqual([2, 1, 1, 1])
    expect(f.stages.map((s) => s.value)).toEqual([300, 300, 500, 50])
  })

  it('totals across every deal and computes the won rate', () => {
    const f = buildFunnel(stages, deals)
    expect(f.totalDeals).toBe(5)
    expect(f.totalValue).toBe(1150)
    expect(f.wonCount).toBe(1)
    expect(f.conversionRate).toBeCloseTo(1 / 5, 10)
  })

  it('counts a deal in no known stage toward the totals but no stage row', () => {
    const f = buildFunnel(stages, [
      deal({ stage_id: 's1', value: 100, status: 'open' }),
      deal({ stage_id: null, value: 999, status: 'open' }),
      deal({ stage_id: 'gone', value: 1, status: 'won' }),
    ])
    // Both the null-stage and the orphaned-stage deal still entered the funnel.
    expect(f.totalDeals).toBe(3)
    expect(f.totalValue).toBe(1100)
    expect(f.wonCount).toBe(1)
    // Only the first deal lands in a stage row; the other two land nowhere.
    expect(f.stages.find((s) => s.id === 's1')?.count).toBe(1)
    expect(f.stages.reduce((sum, s) => sum + s.count, 0)).toBe(1)
    expect(f.conversionRate).toBeCloseTo(1 / 3, 10)
  })

  it('coerces a non-numeric deal value to 0', () => {
    const f = buildFunnel(stages, [deal({ stage_id: 's1', value: Number.NaN, status: 'open' })])
    expect(f.totalValue).toBe(0)
    expect(f.stages.find((s) => s.id === 's1')?.value).toBe(0)
  })
})
