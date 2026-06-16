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
  it('pays the documented finish purse + escalating Gem bonus', () => {
    expect(QUEST.JOURNEY_FINISH_ZAPS).toBe(75)
    expect(QUEST.JOURNEY_GEM_BONUS.initiate).toBe(25)
    expect(QUEST.JOURNEY_GEM_BONUS.adept).toBe(50)
    expect(QUEST.JOURNEY_GEM_BONUS.master).toBe(100)
  })

  it('pays the Expression Challenge by mode (Circle Zaps / online Gems)', () => {
    expect(QUEST.EXPRESSION_CIRCLE_ZAPS).toBe(50)
    expect(QUEST.EXPRESSION_ONLINE_GEMS).toBe(30)
  })
})
