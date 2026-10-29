import { describe, expect, it } from 'vitest'
import { referrerPath, safeReturnPath } from './lightbox'

describe('safeReturnPath', () => {
  it('keeps an in-app path with its query', () => {
    expect(safeReturnPath('/for/venues')).toBe('/for/venues')
    expect(safeReturnPath('/spaces/directory?q=a')).toBe('/spaces/directory?q=a')
  })
  it('falls back to home for anything that is not an in-app path', () => {
    for (const bad of [null, undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/a\nb']) {
      expect(safeReturnPath(bad as string | null | undefined)).toBe('/')
    }
  })
  it('never returns into the launch, which would loop', () => {
    for (const p of ['/launch', '/launch?lid=x', '/launch/step/space', '/spaces/new?mode=a:b', '/create-a-space']) expect(safeReturnPath(p)).toBe('/')
  })
  it('does not mistake a longer path for the launch', () => {
    expect(safeReturnPath('/launchpad')).toBe('/launchpad')
  })
})

describe('referrerPath', () => {
  it('reads a same-origin referrer as a path', () => {
    expect(referrerPath('https://frequencylocal.com/for/venues?x=1', 'https://frequencylocal.com')).toBe('/for/venues?x=1')
  })
  it('drops another origin, junk and nothing', () => {
    expect(referrerPath('https://evil.test/a', 'https://frequencylocal.com')).toBeNull()
    expect(referrerPath('not a url', 'https://frequencylocal.com')).toBeNull()
    expect(referrerPath('', 'https://frequencylocal.com')).toBeNull()
  })
})
