import { describe, it, expect } from 'vitest'
import { SIGNAL_LABELS, explainTrust } from './explain'
import { SIGNAL_WEIGHTS } from './weights'

// LIVE-679: the member's explainable read. Every weighted signal has a sentence, the lines add up to
// the score the projection writes, and a penalty reads as one.

describe('explainTrust', () => {
  it('gives every weighted signal a sentence a member can read', () => {
    for (const key of Object.keys(SIGNAL_WEIGHTS)) expect(SIGNAL_LABELS[key], key).toBeTruthy()
  })

  it('groups by kind, totals each line, and matches the projected score', () => {
    const out = explainTrust([
      { source: 'community', signalType: 'in_person_checkin', context: 'global' },
      { source: 'community', signalType: 'in_person_checkin', context: 'global' },
      { source: 'marketplace', signalType: 'deal_completed', context: 'global' },
      { source: 'moderation', signalType: 'report_upheld', context: 'global' },
      { source: 'unknown', signalType: 'noise', context: 'global' },
    ])
    expect(out.lines.map((l) => [l.key, l.count, l.total])).toEqual([
      ['moderation.report_upheld', 1, -20],
      ['marketplace.deal_completed', 1, 6],
      ['community.in_person_checkin', 2, 4],
    ])
    // 4 + 6 - 20 is below zero; the score is floored exactly as the projection floors it.
    expect(out.score).toBe(0)
  })

  it('reads empty for a member with no signals', () => {
    expect(explainTrust([])).toEqual({ score: 0, lines: [] })
  })
})
