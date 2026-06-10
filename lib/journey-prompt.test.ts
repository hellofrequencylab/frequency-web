import { describe, it, expect } from 'vitest'
import { formatJourneyPrompt } from '@/lib/journey-prompt'

describe('formatJourneyPrompt', () => {
  it('renders "[Journey]: [Practice]. [time]"', () => {
    expect(
      formatJourneyPrompt({ journeyTitle: 'Clear Channel', practiceTitle: 'Morning Stillness', timeNote: '5 minutes' }),
    ).toBe('Clear Channel: Morning Stillness. 5 minutes')
  })
  it('omits the time tail when there is no time note', () => {
    expect(
      formatJourneyPrompt({ journeyTitle: 'Strong Signal', practiceTitle: 'Daily walk', timeNote: '' }),
    ).toBe('Strong Signal: Daily walk')
  })
  it('has no em dash and no guilt language (voice canon)', () => {
    const s = formatJourneyPrompt({ journeyTitle: 'Tune In', practiceTitle: 'Daily meditation', timeNote: '15 minutes' })
    expect(s).not.toContain('—')
    expect(s.toLowerCase()).not.toMatch(/don't|streak|lose|miss/)
  })
})
