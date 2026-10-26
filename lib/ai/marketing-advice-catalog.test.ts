import { describe, expect, it } from 'vitest'
import { selectCampaignQuestions, selectMessagingAdvice } from './marketing-advice-catalog'
describe('reviewed marketing advice projection', () => {
  it('projects only known choices into questions, checks and explicitly proposed measurement', () => {
    expect(selectMessagingAdvice({ questionIds: ['audience', 'audience'], checkIds: ['permission'], measurementId: 'bookings' })).toEqual({ questions: ['Who asked to hear from you, and what do they need next?'], checks: ['Check that recipients asked to hear from you and can opt out.'], measurement: 'Plan to record completed bookings with an explicit campaign reference where available. Missing attribution stays unknown.' })
    expect(selectCampaignQuestions({ questionIds: ['attendance_measurement'] })).toEqual(['How will you record who attended, separately from who clicked?'])
  })
  it.each([
    { questions: ['What about the subject Sunrise Flow?'], checks: ['Publish my wording'], measurement: 'Bookings increased' },
    { questionIds: ['audience'], checkIds: [], measurementId: 'bookings', measurement: 'Invented performance' },
    { questionIds: ['audience'], checkIds: ['constructor'], measurementId: 'bookings' },
    { questionIds: ['__proto__'], checkIds: [], measurementId: 'bookings' },
    { questionIds: ['audience'], checkIds: [], measurementId: 'constructor' },
    { questionIds: [], checkIds: [], measurementId: 'attendance' },
    { questionIds: ['audience','next_step','attendance','reply_prompt','author_words','return_reason'], checkIds: [], measurementId: 'attendance' },
  ])('rejects arbitrary words, prototype keys, unknown IDs, extra fields and excess selections: %j', value => {
    expect(selectMessagingAdvice(value)).toBeNull()
    expect(selectCampaignQuestions(value)).toBeNull()
  })
  it('rejects mixed question text even when an allowed campaign ID is supplied', () => {
    expect(selectCampaignQuestions({ questionIds: ['audience'], questions: ['What about Use this headline?'] })).toBeNull()
    expect(selectCampaignQuestions({ questionIds: ['audience', 'next_step', 'attendance', 'return_reason'] })).toBeNull()
  })
})
