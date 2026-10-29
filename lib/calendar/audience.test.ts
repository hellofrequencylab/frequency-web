import { describe, expect, it } from 'vitest'
import { asksForPublicCalendar, audienceHref, audienceLinks } from './audience'

describe('calendar audience', () => {
  it('names the two calendars by address', () => {
    expect(audienceHref('ocean-house', 'team')).toBe('/spaces/ocean-house/settings/calendar')
    expect(audienceHref('ocean-house', 'public')).toBe('/spaces/ocean-house/calendar?as=public')
    expect(audienceLinks('ocean-house').map((l) => l.label)).toEqual(['Team view', 'Public view'])
  })

  it('reads the public ask from ?as=public and from the old ?view=guest', () => {
    expect(asksForPublicCalendar({ as: 'public' })).toBe(true)
    expect(asksForPublicCalendar({ as: ['public'] })).toBe(true)
    expect(asksForPublicCalendar({ view: 'guest' })).toBe(true)
    expect(asksForPublicCalendar({})).toBe(false)
    expect(asksForPublicCalendar({ as: 'team', view: 'list' })).toBe(false)
  })
})
