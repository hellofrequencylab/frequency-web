import { describe, expect, it } from 'vitest'
import { feedGreetingTime } from './greeting-time'

describe('feed greeting in the member timezone', () => {
  const instant = new Date('2026-10-29T04:47:00Z')

  it('uses the saved day, time and greeting across the UTC midnight boundary', () => {
    expect(feedGreetingTime(instant, 'UTC')).toEqual({ hello: 'Good morning', dateLine: 'Thursday, October 29', clock: '4:47am' })
    expect(feedGreetingTime(instant, 'America/Los_Angeles')).toEqual({ hello: 'Good evening', dateLine: 'Wednesday, October 28', clock: '9:47pm' })
  })

  it('falls back to UTC for missing and invalid zones', () => {
    expect(feedGreetingTime(instant, null)).toEqual(feedGreetingTime(instant, 'UTC'))
    expect(feedGreetingTime(instant, 'not-a-zone')).toEqual(feedGreetingTime(instant, 'UTC'))
  })
})
