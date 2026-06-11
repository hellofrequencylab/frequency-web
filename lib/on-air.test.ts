import { describe, it, expect } from 'vitest'
import {
  BREATH_PATTERNS,
  breathPositionAt,
  cycleSeconds,
  patternBySlug,
  ringScaleAt,
} from './on-air'

const box = patternBySlug('box')
const coherent = patternBySlug('coherent')

describe('patterns', () => {
  it('ships box, coherent and 4-7-8 with correct cycle lengths', () => {
    expect(BREATH_PATTERNS.map((p) => p.slug)).toEqual(['box', 'coherent', '478'])
    expect(cycleSeconds(box)).toBe(16)
    expect(cycleSeconds(coherent)).toBe(11)
    expect(cycleSeconds(patternBySlug('478'))).toBe(19)
  })

  it('falls back to box for unknown slugs', () => {
    expect(patternBySlug('mystery').slug).toBe('box')
    expect(patternBySlug(null).slug).toBe('box')
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
    const a = ringScaleAt(coherent, 1)
    const b = ringScaleAt(coherent, 2)
    const c = ringScaleAt(coherent, 4)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})
