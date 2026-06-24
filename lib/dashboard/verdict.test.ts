import { describe, it, expect } from 'vitest'
import {
  healthVerdict,
  verdictLine,
  spaceVerdictLine,
  tierLabel,
  tierTone,
  healthTone,
  formatDelta,
} from './verdict'

// The cockpit verdict line + tier presentation (ADR-383). PURE, so fully unit-tested. The
// load-bearing rule: the verdict is DERIVED (mean health + worklist length), never curated,
// and every string is in voice (no em or en dashes).

const noDashes = (s: string) => expect(s).not.toMatch(/[—–]/)

describe('healthVerdict', () => {
  it('bands the mean into a standing matching the tier thresholds', () => {
    expect(healthVerdict(80)).toBe('healthy')
    expect(healthVerdict(67)).toBe('healthy')
    expect(healthVerdict(66)).toBe('mixed')
    expect(healthVerdict(34)).toBe('mixed')
    expect(healthVerdict(33)).toBe('strained')
    expect(healthVerdict(0)).toBe('strained')
  })

  it('treats a malformed mean as strained (fail-safe to the loudest)', () => {
    expect(healthVerdict(Number.NaN)).toBe('strained')
  })
})

describe('verdictLine', () => {
  it('leads with the answer and counts who needs you', () => {
    const line = verdictLine(80, 12)
    expect(line).toBe('Resonance is healthy. 12 members need you today.')
    noDashes(line)
  })

  it('uses the singular for exactly one member', () => {
    expect(verdictLine(80, 1)).toBe('Resonance is healthy. 1 member needs you today.')
  })

  it('says inbox-zero plainly when nobody needs you', () => {
    expect(verdictLine(80, 0)).toBe('Resonance is healthy. Nobody needs you right now.')
  })

  it('carries a strained standing through to the sentence', () => {
    expect(verdictLine(20, 5)).toBe('Resonance is strained. 5 members need you today.')
  })

  it('floors negative / fractional attention counts', () => {
    expect(verdictLine(80, -3)).toBe('Resonance is healthy. Nobody needs you right now.')
    expect(verdictLine(80, 2.9)).toBe('Resonance is healthy. 2 members need you today.')
  })
})

describe('spaceVerdictLine', () => {
  it('explains the empty Space before any members are scored', () => {
    const line = spaceVerdictLine(0, 0, 0)
    expect(line).toContain('No scored members in this Space yet')
    noDashes(line)
  })

  it('falls through to the standard verdict once the Space has members', () => {
    expect(spaceVerdictLine(70, 3, 40)).toBe('Resonance is healthy. 3 members need you today.')
  })
})

describe('tier presentation', () => {
  it('labels each tier in voice', () => {
    expect(tierLabel('resonant')).toBe('Resonant')
    expect(tierLabel('cooling')).toBe('Cooling')
    expect(tierLabel('at_risk')).toBe('At risk')
  })

  it('maps each tier to the green/amber/red legend', () => {
    expect(tierTone('resonant')).toBe('success')
    expect(tierTone('cooling')).toBe('warning')
    expect(tierTone('at_risk')).toBe('danger')
  })

  it('colors a raw health number on the same thresholds', () => {
    expect(healthTone(90)).toBe('success')
    expect(healthTone(50)).toBe('warning')
    expect(healthTone(10)).toBe('danger')
    expect(healthTone(Number.NaN)).toBe('danger')
  })
})

describe('formatDelta', () => {
  it('reports a rising metric as good by default', () => {
    const d = formatDelta(80, 72)
    expect(d.trend).toBe('up')
    expect(d.label).toBe('+8 vs last week')
    noDashes(d.label)
  })

  it('reports a falling metric as bad by default', () => {
    const d = formatDelta(60, 72)
    expect(d.trend).toBe('down')
    expect(d.label).toBe('-12 vs last week')
  })

  it('inverts meaning when lower is better (at-risk count falling is good)', () => {
    const d = formatDelta(3, 9, { lowerIsBetter: true })
    expect(d.trend).toBe('up')
    expect(d.label).toBe('-6 vs last week')
  })

  it('handles the first reading with no baseline', () => {
    expect(formatDelta(10, null)).toEqual({ label: 'first reading', trend: 'flat' })
  })

  it('reports no change flatly', () => {
    const d = formatDelta(10, 10)
    expect(d.trend).toBe('flat')
    expect(d.label).toContain('no change')
  })
})
