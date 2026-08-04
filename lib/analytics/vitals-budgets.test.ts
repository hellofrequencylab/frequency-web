import { describe, it, expect } from 'vitest'
import {
  VITALS_BUDGETS,
  BUDGETED_METRICS,
  budgetFor,
  budgetClassFor,
  isBudgetedMetric,
  scoreVital,
  worstStatus,
  formatVital,
  trendPct,
  MIN_SAMPLES,
} from './vitals-budgets'
import { templatePath } from './vitals'

describe('the budgets', () => {
  it('holds the numbers Lift 7a names', () => {
    expect(VITALS_BUDGETS.marketing).toEqual({ lcpMs: 2000, inpMs: 200, cls: 0.1 })
    expect(VITALS_BUDGETS.app.lcpMs).toBe(2500)
    expect(VITALS_BUDGETS.app.inpMs).toBe(200)
    expect(VITALS_BUDGETS.operator.inpMs).toBe(300)
  })

  it('relaxes INP for operators and nothing else', () => {
    expect(VITALS_BUDGETS.operator.lcpMs).toBe(VITALS_BUDGETS.app.lcpMs)
    expect(VITALS_BUDGETS.operator.cls).toBe(VITALS_BUDGETS.marketing.cls)
  })

  it('reads a budget by class and metric', () => {
    expect(budgetFor('marketing', 'LCP')).toBe(2000)
    expect(budgetFor('operator', 'INP')).toBe(300)
    expect(budgetFor('app', 'CLS')).toBe(0.1)
  })

  it('budgets LCP, INP and CLS only', () => {
    expect([...BUDGETED_METRICS]).toEqual(['LCP', 'INP', 'CLS'])
    expect(isBudgetedMetric('TTFB')).toBe(false)
    expect(isBudgetedMetric('LCP')).toBe(true)
  })
})

describe('budgetClassFor', () => {
  it('classes the public marketing surfaces', () => {
    for (const p of ['/', '/pricing', '/how-it-works', '/what-is-frequency', '/beta', '/help/getting-started']) {
      expect(budgetClassFor(p), p).toBe('marketing')
    }
  })

  it('classes public entity profiles as marketing, and their indexes as app', () => {
    expect(budgetClassFor('/spaces/templeofaset')).toBe('marketing')
    expect(budgetClassFor('/events/:id')).toBe('marketing')
    expect(budgetClassFor('/people/danieltyack')).toBe('marketing')
    expect(budgetClassFor('/spaces/directory')).toBe('marketing') // below /spaces/, still public
    expect(budgetClassFor('/events')).toBe('app')
  })

  it('classes the signed-in shell as app', () => {
    for (const p of ['/feed', '/circles', '/practices', '/journeys', '/network/friends', '/settings/profile']) {
      expect(budgetClassFor(p), p).toBe('app')
    }
  })

  it('classes consoles as operator, including ones nested under a public prefix', () => {
    expect(budgetClassFor('/admin')).toBe('operator')
    expect(budgetClassFor('/admin/insights')).toBe('operator')
    expect(budgetClassFor('/spaces/danieltyack/manage')).toBe('operator')
    expect(budgetClassFor('/pages/:id/edit')).toBe('operator')
  })

  it('defaults an unknown path to the app shell, never to the strictest class', () => {
    expect(budgetClassFor('/something-nobody-registered')).toBe('app')
    expect(budgetClassFor(null)).toBe('marketing') // null collapses to '/'
  })

  it('accepts exactly what the collector writes', () => {
    // templatePath is what lands in interaction_events.path, so the classifier has to
    // handle its output verbatim, ':id' segments and all.
    expect(budgetClassFor(templatePath('/events/3f1b2c4d-1111-2222-3333-444455556666'))).toBe('marketing')
    expect(budgetClassFor(templatePath('/admin/insights'))).toBe('operator')
  })

  it('ignores a query string', () => {
    expect(budgetClassFor('/admin/insights?tab=signals')).toBe('operator')
  })
})

describe('scoreVital', () => {
  it('passes comfortably under budget', () => {
    expect(scoreVital(1200, 2000, 50)).toBe('pass')
  })

  it('warns within 10% of the limit', () => {
    expect(scoreVital(1850, 2000, 50)).toBe('watch')
    expect(scoreVital(2000, 2000, 50)).toBe('watch') // exactly at the limit is not a breach
  })

  it('fails over the limit', () => {
    expect(scoreVital(2001, 2000, 50)).toBe('fail')
  })

  it('refuses to score a sample too thin to mean anything', () => {
    expect(scoreVital(9000, 2000, MIN_SAMPLES - 1)).toBe('unknown')
    expect(scoreVital(null, 2000, 500)).toBe('unknown')
  })
})

describe('worstStatus', () => {
  it('lets one breach decide the route', () => {
    expect(worstStatus(['pass', 'pass', 'fail'])).toBe('fail')
    expect(worstStatus(['pass', 'watch'])).toBe('watch')
  })

  it('never lets a missing measurement outrank a real one', () => {
    expect(worstStatus(['unknown', 'pass'])).toBe('pass')
    expect(worstStatus(['unknown'])).toBe('unknown')
    expect(worstStatus([])).toBe('unknown')
  })
})

describe('formatVital', () => {
  it('reads times in ms under a second and seconds above it', () => {
    expect(formatVital('LCP', 384)).toBe('380ms')
    expect(formatVital('LCP', 3598)).toBe('3.60s')
  })

  it('keeps three decimals for CLS', () => {
    expect(formatVital('CLS', 0.1389)).toBe('0.139')
  })

  it('shows an absence as an absence', () => {
    expect(formatVital('INP', null)).toBe('–')
  })
})

describe('trendPct', () => {
  it('reports a rise as worse, because all three metrics are lower-is-better', () => {
    expect(trendPct(2200, 2000)).toBe(10)
    expect(trendPct(1800, 2000)).toBe(-10)
  })

  it('has nothing to say without a previous window', () => {
    expect(trendPct(2200, null)).toBeNull()
    expect(trendPct(null, 2000)).toBeNull()
    expect(trendPct(2200, 0)).toBeNull()
  })
})
