import { describe, it, expect } from 'vitest'
import {
  coerceVerdict,
  defaultStandard,
  DEFAULT_PASS_SCORE,
  ENTITY_REVIEW_FEATURE,
  pendingVerdict,
  QUALITY_STANDARDS,
  qualityStandardFor,
} from './quality-gate'
import { FEATURE_DAILY_CAP_USD } from './budget'

// The generalized pre-publish gate (ADR-993). The parts that must not drift are the ones that
// decide: the score bar under the model's verdict, the fail-closed `pending` state, and the fact
// that every declared standard has a budget cap behind it. No network here.

describe('coerceVerdict (the shared score bar)', () => {
  it('approves when the model approves and the score clears the bar', () => {
    const v = coerceVerdict({ verdict: 'approved', score: 82, feedback: ['Strong premise.'] }, 'journey', 70)
    expect(v?.status).toBe('approved')
    expect(v?.entity).toBe('journey')
  })

  it('downgrades a model "approved" whose score is below the bar', () => {
    expect(coerceVerdict({ verdict: 'approved', score: 69, feedback: ['x'] }, 'event', 70)?.status).toBe('rejected')
  })

  it('honours a stricter bar per standard', () => {
    const raw = { verdict: 'approved', score: 75, feedback: ['x'] }
    expect(coerceVerdict(raw, 'a', 70)?.status).toBe('approved')
    expect(coerceVerdict(raw, 'a', 80)?.status).toBe('rejected')
  })

  it('never approves a rejected verdict, even with a high score', () => {
    expect(coerceVerdict({ verdict: 'rejected', score: 99, feedback: ['x'] }, 'a', 70)?.status).toBe('rejected')
  })

  it('clamps and rounds the score, and caps the coaching at five lines', () => {
    expect(coerceVerdict({ verdict: 'rejected', score: 140, feedback: ['x'] }, 'a', 70)?.score).toBe(100)
    expect(coerceVerdict({ verdict: 'rejected', score: -5, feedback: ['x'] }, 'a', 70)?.score).toBe(0)
    expect(coerceVerdict({ verdict: 'rejected', score: 73.6, feedback: ['x'] }, 'a', 70)?.score).toBe(74)
    const many = coerceVerdict(
      { verdict: 'rejected', score: 10, feedback: [' a ', '', 'b', 'c', 'd', 'e', 'f'] },
      'a',
      70,
    )
    expect(many?.feedback).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('rejects an unusable shape rather than guessing', () => {
    expect(coerceVerdict(null, 'a', 70)).toBeNull()
    expect(coerceVerdict({ verdict: 'approved', feedback: ['x'] }, 'a', 70)).toBeNull()
    expect(coerceVerdict({ verdict: 'approved', score: 80, feedback: [] }, 'a', 70)).toBeNull()
  })
})

describe('the fail-closed state', () => {
  it('pendingVerdict is never a pass and scores zero', () => {
    const v = pendingVerdict('practice', ['Vera is having a breather.'])
    expect(v.status).toBe('pending')
    expect(v.score).toBe(0)
    expect(v.status).not.toBe('approved')
  })
})

describe('the standards catalog (the opt-in)', () => {
  it('keeps the Journey gate exactly as it was: Opus, its own key, the 70 bar', () => {
    const journey = qualityStandardFor('journey')
    expect(journey).toBe(QUALITY_STANDARDS.journey)
    expect(journey.feature).toBe('journey-review')
    expect(journey.tier).toBe('opus')
    expect(journey.passScore).toBe(70)
    expect(journey.rubricPath?.join('/')).toContain('how-to-create-a-journey.md')
  })

  it('gives any other entity a usable default standard on the shared key', () => {
    const s = qualityStandardFor('event', 'Event')
    expect(s.entity).toBe('event')
    expect(s.feature).toBe(ENTITY_REVIEW_FEATURE)
    expect(s.tier).toBe('sonnet')
    expect(s.passScore).toBe(DEFAULT_PASS_SCORE)
    expect(s.fallbackRubric.length).toBeGreaterThan(50)
  })

  it('every standard carries a budget cap, fail-closed copy, and a rubric', () => {
    const standards = [...Object.values(QUALITY_STANDARDS), defaultStandard('event', 'Event')]
    for (const s of standards) {
      expect(FEATURE_DAILY_CAP_USD[s.feature]).toBeGreaterThan(0)
      expect(s.fallbackRubric.trim().length).toBeGreaterThan(0)
      for (const line of [s.pending.paused, s.pending.budget, s.pending.failed]) {
        expect(line.trim().length).toBeGreaterThan(0)
        // Voice canon: member-facing copy carries no em dashes.
        expect(line).not.toContain('—')
      }
    }
  })
})
