import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dailyCapFor } from './budget'
import { withPracticeShape, PRACTICE_SHAPE_PRIMER } from './practice-shape'

// The Practice builder's Vera surface (ADR-358), the atom-level twin of the Journey builder.
// These lock the contract that matters without a live model: the budget caps exist, the shape
// primer prepends (like withJourneyShape), and both AI entry points DEGRADE TO NULL when AI is
// off, so the builder always falls back to hand-entry.

describe('practice builder budget caps (ADR-358)', () => {
  it('configures a cap for the practice spark + edit features', () => {
    expect(dailyCapFor('practice-spark')).toBe(2)
    expect(dailyCapFor('practice-edit')).toBe(4)
  })
})

describe('withPracticeShape', () => {
  it('prepends the Practice-shape primer above the task prompt (twin of withJourneyShape)', () => {
    const out = withPracticeShape('TASK RULES')
    expect(out.startsWith(PRACTICE_SHAPE_PRIMER)).toBe(true)
    expect(out.endsWith('TASK RULES')).toBe(true)
    // The primer sits ABOVE the task, so a task-specific rule keeps precedence.
    expect(out.indexOf(PRACTICE_SHAPE_PRIMER)).toBeLessThan(out.indexOf('TASK RULES'))
  })

  it('names a Practice as one act, never narrates feelings, bans the long dash', () => {
    expect(PRACTICE_SHAPE_PRIMER).toContain('Pillar')
    expect(PRACTICE_SHAPE_PRIMER).toContain('five-minute rule')
    // No em dashes anywhere in the model-facing primer (CONTENT-VOICE hard rule).
    expect(PRACTICE_SHAPE_PRIMER).not.toContain('—')
  })
})

// Force AI off so the functions take the degrade path without touching a model. The client module
// reads an env switch; with no key + AI disabled, aiEnabled() is false and the functions return
// null before any network call.
vi.mock('./client', () => ({
  aiEnabled: () => false,
  getAnthropic: () => null,
}))

describe('Vera practice functions degrade to null when AI is off', () => {
  beforeEach(() => vi.clearAllMocks())

  it('draftPracticeSpark returns null (so the wizard lets the author type it)', async () => {
    const { draftPracticeSpark } = await import('./practice-spark')
    const out = await draftPracticeSpark({
      who: 'people who feel wired',
      act: 'a two-minute morning sit',
      outcome: 'a calmer start',
      cadence: 'daily',
      pace: 'light',
    })
    expect(out).toBeNull()
  })

  it('planPracticeEdits returns null (so the action leaves the Practice untouched)', async () => {
    const { planPracticeEdits } = await import('./practice-edit')
    const out = await planPracticeEdits({
      request: 'make it gentler',
      practice: { title: 'Sit', summary: '', description: '', body: 'Sit down.', cadence: 'Daily' },
    })
    expect(out).toBeNull()
  })
})
