import { describe, it, expect } from 'vitest'
import { cleanDispatchCopy } from './vera-dispatch'

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
