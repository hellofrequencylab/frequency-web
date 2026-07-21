import { describe, it, expect } from 'vitest'
import {
  COMPARISON_GROUPS,
  allComparisonRows,
  competitorMonthlyTotal,
  comparisonToolCount,
  monthlySaving,
  yearlySaving,
  FREQUENCY_BUSINESS_MONTHLY,
} from './comparison'

describe('pricing comparison catalog', () => {
  it('has non-empty groups, each row fully specified', () => {
    expect(COMPARISON_GROUPS.length).toBeGreaterThan(3)
    for (const row of allComparisonRows()) {
      expect(row.feature.trim()).toBeTruthy()
      expect(row.ours.trim()).toBeTruthy()
      expect(row.competitor.trim()).toBeTruthy()
      expect(row.competitorMonthly === null || row.competitorMonthly > 0).toBe(true)
    }
  })

  it('totals the subscription floor from the numeric rows (fee-based rows excluded)', () => {
    const manual = allComparisonRows().reduce((s, r) => s + (r.competitorMonthly ?? 0), 0)
    expect(competitorMonthlyTotal()).toBe(manual)
    // The stack is materially more than the flat plan (the whole point).
    expect(competitorMonthlyTotal()).toBeGreaterThan(FREQUENCY_BUSINESS_MONTHLY * 5)
  })

  it('counts only real separate tools (excludes the no-equivalent / everywhere-else rows)', () => {
    const tools = comparisonToolCount()
    expect(tools).toBeGreaterThan(10)
    expect(tools).toBeLessThanOrEqual(allComparisonRows().length)
  })

  it('derives the saving from the total minus the flat plan', () => {
    expect(monthlySaving()).toBe(competitorMonthlyTotal() - FREQUENCY_BUSINESS_MONTHLY)
    expect(yearlySaving()).toBe(monthlySaving() * 12)
  })

  it('has no em dashes in any copy (CONTENT-VOICE canon)', () => {
    for (const row of allComparisonRows()) {
      for (const s of [row.feature, row.ours, row.competitor, row.note ?? '']) {
        expect(s.includes('—'), `em dash in "${s}"`).toBe(false)
      }
    }
  })
})
