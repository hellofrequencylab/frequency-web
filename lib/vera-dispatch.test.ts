import { describe, it, expect } from 'vitest'
import { cleanDispatchCopy, unstatedActivityWords } from './vera-dispatch'

describe('cleanDispatchCopy', () => {
  it('passes a good line through', () => {
    expect(cleanDispatchCopy('Next on Morning Flow: Breathwork. One log keeps the week on track.')).toBe(
      'Next on Morning Flow: Breathwork. One log keeps the week on track.',
    )
  })

  it('strips wrapping quotes and Vera prefixes', () => {
    expect(cleanDispatchCopy('"Two logs to 25 Deep. Keep digging."')).toBe(
      'Two logs to 25 Deep. Keep digging.',
    )
    expect(cleanDispatchCopy('Vera: Show up once this week.')).toBe('Show up once this week.')
  })

  it('swaps em dashes for commas (voice canon)', () => {
    expect(cleanDispatchCopy('One step left — finish it tonight.')).toBe(
      'One step left, finish it tonight.',
    )
  })

  it('collapses model whitespace', () => {
    expect(cleanDispatchCopy('Same time\n\ntomorrow.   Bring one practice.')).toBe(
      'Same time tomorrow. Bring one practice.',
    )
  })

  it('rejects junk: empty, too short, too long, emoji', () => {
    expect(cleanDispatchCopy('')).toBeNull()
    expect(cleanDispatchCopy('Ok.')).toBeNull()
    expect(cleanDispatchCopy('x'.repeat(200))).toBeNull()
    expect(cleanDispatchCopy('Great work today! 🔥 Keep the streak alive tomorrow.')).toBeNull()
  })
})

// LIVE-674: the daily Dispatch is cached and replays after every session that day, so a voiced
// line may name an activity only when the fact it was handed names it.
describe('the voiced line never names an activity the fact did not', () => {
  const steady = 'Same time tomorrow. Bring one practice. The streak does the rest.'

  it('rejects a voiced line that invents an activity', () => {
    expect(cleanDispatchCopy('Good sit. Same time tomorrow, one practice keeps the streak.', steady)).toBeNull()
    expect(cleanDispatchCopy('Nice walk today. Same time tomorrow, bring one practice.', steady)).toBeNull()
    expect(cleanDispatchCopy('Same time tomorrow. One more yoga flow keeps the streak going.', steady)).toBeNull()
    expect(cleanDispatchCopy('Keep breathing. Same time tomorrow, bring one practice.', steady)).toBeNull()
  })

  it('passes a faithful rephrase, and an activity the fact itself names', () => {
    expect(cleanDispatchCopy('Same time tomorrow. One practice, and the streak handles the rest.', steady)).toBe(
      'Same time tomorrow. One practice, and the streak handles the rest.',
    )
    const journey = 'Next on Morning Walk: Hills. Pick it up where you left off.'
    expect(cleanDispatchCopy('Next on Morning Walk: Hills. Pick it back up.', journey)).toBe(
      'Next on Morning Walk: Hills. Pick it back up.',
    )
    // The same fact does not license a DIFFERENT activity.
    expect(cleanDispatchCopy('Next on Morning Walk: Hills. A short run counts too.', journey)).toBeNull()
  })

  it('lists exactly the unstated words, case-insensitive, once each', () => {
    expect(unstatedActivityWords('A Sit, then a sit, then a WALK.', 'Walk it off.')).toEqual(['sit'])
    expect(unstatedActivityWords('The streak does the rest.', '')).toEqual([])
    // Word boundaries: "streak" is not "stretch", "Saturday" is not "sat".
    expect(unstatedActivityWords('Your streak holds till Saturday.', '')).toEqual([])
  })
})
