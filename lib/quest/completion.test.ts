import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isJourneyFinished } from './completion'
import { QUEST } from '@/lib/gamification'
import { rankForCompletion } from '@/lib/season-ranks'

// Pure eligibility + rank math for the Quest completion model (ADR-Quest). The DB
// reads (distinct days, Expression Challenge) are integration concerns; the rule that
// turns those signals into "finished" is the pure logic worth pinning here.

describe('isJourneyFinished (the 14-day + Expression gate)', () => {
  const bar = QUEST.DAYS_TO_FINISH_JOURNEY // 14

  it('is not finished below the day threshold, even with the Expression done', () => {
    expect(isJourneyFinished(bar - 1, true, true)).toBe(false) // 13 days
    expect(isJourneyFinished(0, true, true)).toBe(false)
  })

  it('is finished at the day threshold WITH a required Expression done', () => {
    expect(isJourneyFinished(bar, true, true)).toBe(true) // 14 days
    expect(isJourneyFinished(bar + 2, true, true)).toBe(true) // 16 days (top of the band)
  })

  it('is NOT finished with enough days but a required Expression undone', () => {
    expect(isJourneyFinished(bar, true, false)).toBe(false)
    expect(isJourneyFinished(bar + 5, true, false)).toBe(false)
  })

  it('finishes a library Journey on days alone when no Expression is required', () => {
    expect(isJourneyFinished(bar, false, false)).toBe(true) // member-built: no Expression
    expect(isJourneyFinished(bar - 1, false, false)).toBe(false) // still needs the days
  })

  it('keys the bar off the constant, not a magic number', () => {
    expect(QUEST.DAYS_TO_FINISH_JOURNEY).toBe(14)
  })
})

describe('rankForCompletion (completions → rank)', () => {
  it('maps 0/1/2/3 completions to ghost/initiate/adept/master', () => {
    expect(rankForCompletion(0)).toBe('ghost')
    expect(rankForCompletion(1)).toBe('initiate')
    expect(rankForCompletion(2)).toBe('adept')
    expect(rankForCompletion(3)).toBe('master')
  })

  it('caps at master for 3+ completions', () => {
    expect(rankForCompletion(4)).toBe('master')
    expect(rankForCompletion(10)).toBe('master')
  })
})

describe('QUEST reward constants', () => {
  it('pays the documented finish purse, and no Gem ladder with it', () => {
    expect(QUEST.JOURNEY_FINISH_ZAPS).toBe(75)
    // LIVE-185: finishing a Journey pays +75 Zaps and a Pillar Trophy, full stop (ADR-305,
    // docs/NAMING.md §Economy). The v2 escalating per-Journey Gem ladder (initiate 25 /
    // adept 50 / master 100) is RETIRED, so the completion path must not read it. This
    // asserts the SOURCE has no reference left; the behavioural pin (no Gem grant, no Gem
    // ledger row on a finish) lives in lib/quest/complete.test.ts.
    const complete = readFileSync(join(__dirname, 'complete.ts'), 'utf8')
    expect(complete).not.toContain('JOURNEY_GEM_BONUS')
  })

  it('pays the Expression Challenge by mode (Circle Zaps / online Gems)', () => {
    expect(QUEST.EXPRESSION_CIRCLE_ZAPS).toBe(50)
    expect(QUEST.EXPRESSION_ONLINE_GEMS).toBe(30)
  })
})
