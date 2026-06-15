import { describe, it, expect } from 'vitest'
import { coerce, PASS_SCORE } from './journey-review'

// The gate logic that decides ranked eligibility is the part that must not drift, so it's
// unit-tested without any network: the model's verdict AND the score bar both have to agree
// to approve, and every field is coerced because we never trust the raw model shape.

describe('coerce (the Vera rank gate)', () => {
  it('approves when the model approves and the score clears the bar', () => {
    const r = coerce({ verdict: 'approved', score: 82, feedback: ['Strong premise. Keep it.'] })
    expect(r?.status).toBe('approved')
    expect(r?.score).toBe(82)
  })

  it('downgrades a model "approved" whose score is below the bar', () => {
    const r = coerce({ verdict: 'approved', score: PASS_SCORE - 1, feedback: ['Add a heavier practice.'] })
    expect(r?.status).toBe('rejected')
  })

  it('approves exactly at the bar', () => {
    const r = coerce({ verdict: 'approved', score: PASS_SCORE, feedback: ['Right on the line.'] })
    expect(r?.status).toBe('approved')
  })

  it('never approves a rejected verdict, even with a high score', () => {
    const r = coerce({ verdict: 'rejected', score: 95, feedback: ['The capstone is missing.'] })
    expect(r?.status).toBe('rejected')
  })

  it('clamps the score into 0..100 and rounds it', () => {
    expect(coerce({ verdict: 'rejected', score: 140, feedback: ['x'] })?.score).toBe(100)
    expect(coerce({ verdict: 'rejected', score: -20, feedback: ['x'] })?.score).toBe(0)
    expect(coerce({ verdict: 'approved', score: 73.6, feedback: ['x'] })?.score).toBe(74)
  })

  it('keeps at most five feedback lines, trimmed and non-empty', () => {
    const r = coerce({
      verdict: 'rejected',
      score: 40,
      feedback: ['  a  ', '', 'b', '   ', 'c', 'd', 'e', 'f'],
    })
    expect(r?.feedback).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('rejects an unusable shape (no score, no feedback)', () => {
    expect(coerce(null)).toBeNull()
    expect(coerce({ verdict: 'approved', feedback: ['x'] })).toBeNull()
    expect(coerce({ verdict: 'approved', score: 80, feedback: [] })).toBeNull()
    expect(coerce({ verdict: 'approved', score: 80 })).toBeNull()
  })

  it('treats a missing/garbage verdict as not approved', () => {
    expect(coerce({ score: 90, feedback: ['x'] })?.status).toBe('rejected')
    expect(coerce({ verdict: 'maybe', score: 90, feedback: ['x'] })?.status).toBe('rejected')
  })
})
