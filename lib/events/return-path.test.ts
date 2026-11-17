import { describe, expect, it } from 'vitest'
import { safeReturnPath, withReturnPath } from './return-path'

describe('safeReturnPath (LIVE-2319)', () => {
  it('accepts a Space path', () => {
    expect(safeReturnPath('/spaces/house-of-fates/calendar')).toBe('/spaces/house-of-fates/calendar')
    expect(safeReturnPath('/spaces/house-of-fates/settings/calendar')).toBe('/spaces/house-of-fates/settings/calendar')
    expect(safeReturnPath('/spaces/hof/settings/calendar?view=month')).toBe('/spaces/hof/settings/calendar?view=month')
    expect(safeReturnPath(['/spaces/hof/calendar'])).toBe('/spaces/hof/calendar')
  })

  it('refuses anything that could leave the site or the Spaces area', () => {
    for (const bad of [
      'https://evil.example/spaces/x',
      '//evil.example/spaces/x',
      '/\\evil.example',
      '/spaces/../admin',
      '/spaces/x/../../admin',
      '/events',
      '/spacesx/y',
      'spaces/x',
      '/spaces/x y',
      'javascript:alert(1)',
      '',
      undefined,
      42,
    ]) {
      expect(safeReturnPath(bad)).toBeNull()
    }
  })
})

describe('withReturnPath', () => {
  it('adds the return param to a create link', () => {
    expect(withReturnPath('/events/new?space=s1', '/spaces/hof/calendar')).toBe(
      '/events/new?space=s1&return=%2Fspaces%2Fhof%2Fcalendar',
    )
    expect(withReturnPath('/events/new', '/spaces/hof/calendar')).toBe('/events/new?return=%2Fspaces%2Fhof%2Fcalendar')
  })

  it('leaves the link alone without a safe path', () => {
    expect(withReturnPath('/events/new?space=s1', null)).toBe('/events/new?space=s1')
    expect(withReturnPath('/events/new?space=s1', '/events')).toBe('/events/new?space=s1')
  })
})
