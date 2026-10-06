import { describe, it, expect } from 'vitest'

// LIVE-676: the Space copilot eval harness. The fallbacks run with no network and must clear the
// same bar the live model is held to; the rubric must catch the failures it names. The live run
// (`pnpm eval:copilot`, COPILOT_EVAL_LIVE=1 with a model key) is skipped in CI.

import {
  PASS_SCORE,
  SPACE_COPILOT_EVAL_SET,
  runSpaceCopilotEval,
  scoreSpaceDraft,
} from './space-copilot-eval'
import { draftSpaceBio, fallbackBio, fallbackTagline, offeringFacts, suggestTagline } from './space-copilot'

const STUDIO = SPACE_COPILOT_EVAL_SET.find((s) => s.id === 'rich-studio')!.ctx

describe('the rubric', () => {
  it('passes a plain, grounded bio', () => {
    const s = scoreSpaceDraft('bio', 'North Light Yoga is a small studio in Leucadia with slow morning classes and a Sunday sit.', STUDIO)
    expect(s).toEqual({ score: 100, failures: [] })
  })

  it('flags an invented number, a dash and hype', () => {
    const s = scoreSpaceDraft('bio', 'North Light Yoga has served 300 students since 2009 — an amazing studio.', STUDIO)
    expect(s.failures).toEqual(expect.arrayContaining(['em or en dash', 'hype', 'invented number: 300, 2009']))
    expect(s.score).toBeLessThan(PASS_SCORE)
  })

  it('allows a number the facts carry', () => {
    expect(scoreSpaceDraft('tagline', 'Slow mornings and a 5 class pass', STUDIO).failures).toEqual([])
  })

  it('flags a tagline that runs long or a bio that skips the name', () => {
    expect(scoreSpaceDraft('tagline', 'A '.repeat(20) + 'studio', STUDIO).failures).toContain('tagline too wordy')
    expect(scoreSpaceDraft('bio', 'A small studio with slow morning classes for everyone nearby.', STUDIO).failures).toContain(
      'does not name the Space',
    )
  })
})

describe('the fallbacks clear the bar on every Space in the set', () => {
  it('bio', async () => {
    const report = await runSpaceCopilotEval('bio', fallbackBio)
    expect(report.rows.filter((r) => r.score < PASS_SCORE)).toEqual([])
  })

  it('tagline', async () => {
    const report = await runSpaceCopilotEval('tagline', fallbackTagline)
    expect(report.rows.filter((r) => r.score < PASS_SCORE)).toEqual([])
  })
})

describe('grounding', () => {
  it('puts the live offerings in the facts', () => {
    expect(offeringFacts(STUDIO)).toBe(
      'What they offer right now: Event: Sunday community sit; Practice: Ten minute morning stretch; Product: 5 class pass.',
    )
    expect(offeringFacts({ name: 'Bare' })).toBe('')
  })
})

describe.skipIf(!process.env.COPILOT_EVAL_LIVE)('live model (pnpm eval:copilot)', () => {
  it('scores the live drafts', { timeout: 120_000 }, async () => {
    for (const [kind, drafter] of [
      ['bio', draftSpaceBio],
      ['tagline', suggestTagline],
    ] as const) {
      const report = await runSpaceCopilotEval(kind, drafter)
      console.log(JSON.stringify(report, null, 2))
      expect(report.mean).toBeGreaterThanOrEqual(PASS_SCORE)
    }
  })
})
