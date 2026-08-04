import { describe, it, expect } from 'vitest'
import { buildVitalsReadout, type RawVitalRow } from './insights-read'

// Rows shaped exactly as `vitals_p75` returns them over PostgREST: numeric arrives as a
// STRING, and a route only reports the metrics it actually collected.
const row = (o: Partial<RawVitalRow> & Pick<RawVitalRow, 'path' | 'metric'>): RawVitalRow => ({
  p75: null,
  samples: 0,
  prev_p75: null,
  prev_samples: 0,
  ...o,
})

describe('buildVitalsReadout', () => {
  it('groups by route and scores against that route’s class budget', () => {
    const out = buildVitalsReadout(
      [
        row({ path: '/pricing', metric: 'LCP', p75: '1500', samples: 40 }),
        row({ path: '/pricing', metric: 'INP', p75: '120', samples: 40 }),
      ],
      28,
    )
    expect(out.routes).toHaveLength(1)
    const r = out.routes[0]
    expect(r.budgetClass).toBe('marketing')
    expect(r.cells.find((c) => c.metric === 'LCP')!.budget).toBe(2000)
    // CLS was never collected on this route, so it scores 'unknown'. A metric with no
    // measurement does not drag the route down: the two real results decide it.
    expect(r.cells.find((c) => c.metric === 'CLS')!.status).toBe('unknown')
    expect(r.status).toBe('pass')
  })

  it('parses numeric strings and rounds nothing away', () => {
    const out = buildVitalsReadout(
      [row({ path: '/feed', metric: 'CLS', p75: '0.1389', samples: 10, prev_p75: '0.1' })],
      28,
    )
    const cls = out.routes[0].cells.find((c) => c.metric === 'CLS')!
    expect(cls.p75).toBeCloseTo(0.1389, 4)
    expect(cls.status).toBe('fail') // over the 0.1 budget
    expect(cls.trendPct).toBe(39)
  })

  it('lets one failing metric decide the route, and sorts the breach to the top', () => {
    const out = buildVitalsReadout(
      [
        row({ path: '/feed', metric: 'LCP', p75: '3598', samples: 11 }),
        row({ path: '/feed', metric: 'INP', p75: '384', samples: 13 }),
        row({ path: '/feed', metric: 'CLS', p75: '0.05', samples: 10 }),
        row({ path: '/practices', metric: 'LCP', p75: '900', samples: 20 }),
        row({ path: '/practices', metric: 'INP', p75: '80', samples: 20 }),
        row({ path: '/practices', metric: 'CLS', p75: '0.01', samples: 20 }),
      ],
      28,
    )
    expect(out.routes[0].path).toBe('/feed')
    expect(out.routes[0].status).toBe('fail')
    expect(out.routes[1].status).toBe('pass')
    expect(out.tally).toEqual({ pass: 1, watch: 0, fail: 1, unknown: 0 })
  })

  it('reports a route with too few loads as unscored, not as passing', () => {
    const out = buildVitalsReadout(
      [
        row({ path: '/market', metric: 'LCP', p75: '90000', samples: 1 }),
        row({ path: '/market', metric: 'INP', p75: '9000', samples: 1 }),
        row({ path: '/market', metric: 'CLS', p75: '9', samples: 1 }),
      ],
      28,
    )
    expect(out.routes[0].status).toBe('unknown')
    expect(out.tally.unknown).toBe(1)
  })

  it('has no trend without a previous window', () => {
    const out = buildVitalsReadout(
      [row({ path: '/', metric: 'LCP', p75: '1800', samples: 30, prev_samples: 0 })],
      28,
    )
    expect(out.routes[0].cells.find((c) => c.metric === 'LCP')!.trendPct).toBeNull()
  })

  it('survives an empty read', () => {
    const out = buildVitalsReadout([], 28)
    expect(out.routes).toEqual([])
    expect(out.tally).toEqual({ pass: 0, watch: 0, fail: 0, unknown: 0 })
    expect(out.windowDays).toBe(28)
  })
})
