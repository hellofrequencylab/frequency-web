import { describe, it, expect } from 'vitest'
import {
  BREATH_PATTERNS,
  breathPositionAt,
  buildCustomPattern,
  buildSessionDispatch,
  cycleSeconds,
  patternBySlug,
  ringScaleAt,
} from './on-air'

const box = patternBySlug('box')
const sigh = patternBySlug('3x')

describe('patterns', () => {
  it('ships box, coherence, triangle, 3X and 4-7-8 with correct cycle lengths', () => {
    expect(BREATH_PATTERNS.map((p) => p.slug)).toEqual(['box', 'cohere', 'triangle', '3x', '478'])
    expect(cycleSeconds(box)).toBe(16)
    expect(cycleSeconds(patternBySlug('cohere'))).toBe(10)
    expect(cycleSeconds(patternBySlug('triangle'))).toBe(12)
    expect(cycleSeconds(sigh)).toBe(12)
    expect(cycleSeconds(patternBySlug('478'))).toBe(19)
  })

  it('falls back to box for unknown slugs (including the retired coherent)', () => {
    expect(patternBySlug('mystery').slug).toBe('box')
    expect(patternBySlug('coherent').slug).toBe('box')
    expect(patternBySlug(null).slug).toBe('box')
  })
})

describe('buildCustomPattern', () => {
  it('builds in → hold → out with the given seconds', () => {
    const p = buildCustomPattern(4, 7, 8)
    expect(p.slug).toBe('custom')
    expect(p.name).toBe('Custom')
    expect(p.phases.map((ph) => ph.kind)).toEqual(['in', 'hold', 'out'])
    expect(p.phases.map((ph) => ph.seconds)).toEqual([4, 7, 8])
    expect(cycleSeconds(p)).toBe(19)
  })

  it('clamps in and out to 3–8 and hold to 0–8', () => {
    const low = buildCustomPattern(1, -2, 0)
    expect(low.phases.map((ph) => ph.seconds)).toEqual([3, 3]) // hold clamps to 0 → omitted
    expect(low.phases.map((ph) => ph.kind)).toEqual(['in', 'out'])
    const high = buildCustomPattern(20, 99, 12)
    expect(high.phases.map((ph) => ph.seconds)).toEqual([8, 8, 8])
    expect(cycleSeconds(high)).toBe(24)
  })

  it('omits the hold phase entirely when hold is 0', () => {
    const p = buildCustomPattern(5, 0, 6)
    expect(p.phases.map((ph) => ph.kind)).toEqual(['in', 'out'])
    expect(cycleSeconds(p)).toBe(11)
    // the cycle walks straight from inhale to exhale
    expect(breathPositionAt(p, 4.9).phase.kind).toBe('in')
    expect(breathPositionAt(p, 5.1).phase.kind).toBe('out')
  })

  it('survives junk input by falling back to the floor', () => {
    const p = buildCustomPattern(Number.NaN, Number.NaN, Number.POSITIVE_INFINITY)
    expect(p.phases.map((ph) => ph.seconds)).toEqual([3, 8])
    expect(p.phases.map((ph) => ph.kind)).toEqual(['in', 'out'])
  })
})

describe('breathPositionAt', () => {
  it('walks the box phases in order', () => {
    expect(breathPositionAt(box, 0).phase.kind).toBe('in')
    expect(breathPositionAt(box, 5).phase.kind).toBe('hold')
    expect(breathPositionAt(box, 9).phase.kind).toBe('out')
    expect(breathPositionAt(box, 13).phase.kind).toBe('hold')
  })

  it('wraps around the cycle', () => {
    expect(breathPositionAt(box, 16).phase.kind).toBe('in')
    expect(breathPositionAt(box, 16 + 5).phase.kind).toBe('hold')
  })

  it('reports phase progress', () => {
    const p = breathPositionAt(box, 2)
    expect(p.phaseElapsed).toBe(2)
    expect(p.phaseProgress).toBeCloseTo(0.5)
  })
})

describe('buildSessionDispatch', () => {
  it('reminds about a single practice left and points at /practices', () => {
    const d = buildSessionDispatch({ practicesLeft: ['Morning Pages'], gathering: null })
    expect(d.copy).toContain('Morning Pages')
    expect(d.actionHref).toBe('/practices')
    expect(d.actionLabel).toBe('See your practices')
  })

  it('counts multiple practices left and names the first one', () => {
    const d = buildSessionDispatch({
      practicesLeft: ['Cold Plunge', 'Gratitude', 'Walk'],
      gathering: null,
    })
    expect(d.copy).toContain('3 Practices')
    expect(d.copy).toContain('Cold Plunge')
    expect(d.actionHref).toBe('/practices')
  })

  it('congratulates and names an RSVP’d gathering when nothing is left', () => {
    const d = buildSessionDispatch({
      practicesLeft: [],
      gathering: { title: 'Sunday Sit', slug: 'sunday-sit' },
    })
    expect(d.copy).toContain('Sunday Sit')
    expect(d.actionHref).toBe('/events/sunday-sit')
    expect(d.actionLabel).toBe('View event')
  })

  it('practices-left takes priority over a gathering', () => {
    const d = buildSessionDispatch({
      practicesLeft: ['Breathwork'],
      gathering: { title: 'Sunday Sit', slug: 'sunday-sit' },
    })
    expect(d.actionHref).toBe('/practices')
  })

  it('congratulates and returns to the feed when done with nothing pending', () => {
    const d = buildSessionDispatch({ practicesLeft: [], gathering: null })
    expect(d.actionHref).toBe('/feed')
    expect(d.actionLabel).toBe('Back to feed')
  })

  it('ignores blank practice titles', () => {
    const d = buildSessionDispatch({ practicesLeft: ['', '   '], gathering: null })
    expect(d.actionHref).toBe('/feed')
  })

  it('never emits an em dash', () => {
    const cases = [
      buildSessionDispatch({ practicesLeft: ['A'], gathering: null }),
      buildSessionDispatch({ practicesLeft: ['A', 'B'], gathering: null }),
      buildSessionDispatch({ practicesLeft: [], gathering: { title: 'X', slug: 'x' } }),
      buildSessionDispatch({ practicesLeft: [], gathering: null }),
    ]
    for (const d of cases) expect(d.copy).not.toContain('—')
  })
})

describe('ringScaleAt', () => {
  it('grows through the inhale and settles through the exhale', () => {
    expect(ringScaleAt(box, 0)).toBeCloseTo(0.62)
    expect(ringScaleAt(box, 4)).toBeCloseTo(1) // inhale complete
    expect(ringScaleAt(box, 12)).toBeCloseTo(0.62) // exhale complete
  })

  it('holds full after an inhale and small after an exhale', () => {
    expect(ringScaleAt(box, 6)).toBeCloseTo(1) // hold after in
    expect(ringScaleAt(box, 14)).toBeCloseTo(0.62) // hold after out
  })

  it('moves monotonically within a phase', () => {
    const a = ringScaleAt(box, 1)
    const b = ringScaleAt(box, 2)
    const c = ringScaleAt(box, 3.5)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it('stacks the 3X double inhale without resetting between breaths', () => {
    // End of the big inhale meets the start of the sip exactly (no jump)...
    const endOfFirst = ringScaleAt(sigh, 3.999)
    const startOfSip = ringScaleAt(sigh, 4.001)
    expect(Math.abs(endOfFirst - startOfSip)).toBeLessThan(0.01)
    // ...the sip keeps climbing to full...
    expect(ringScaleAt(sigh, 5)).toBeCloseTo(1)
    // ...and the long exhale settles back to small.
    expect(ringScaleAt(sigh, 11.999)).toBeCloseTo(0.62, 1)
  })
})
