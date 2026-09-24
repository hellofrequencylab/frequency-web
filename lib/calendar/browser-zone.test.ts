import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserZone, newDateZone } from './browser-zone'

// THE DEFAULT ZONE FOR A NEW DATE (LIVE-471). The row exists because this order was the other way
// round: the browser won, and a travelling operator's airport wrote itself into the Space's calendar.

/** Pin what the "browser" says, the way the two calendar surfaces actually read it. */
function pinBrowserZone(timeZone: string | null) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...real.call(this), timeZone: timeZone as string }
  })
}

afterEach(() => vi.restoreAllMocks())

describe('newDateZone: the Space zone wins', () => {
  it('lands on the Space zone even when the operator is somewhere else entirely', () => {
    pinBrowserZone('Europe/Lisbon')
    expect(newDateZone('America/Los_Angeles')).toBe('America/Los_Angeles')
  })

  it('keeps the Space zone when it is the unusual one and the browser is the house zone', () => {
    pinBrowserZone('America/Los_Angeles')
    expect(newDateZone('Pacific/Auckland')).toBe('Pacific/Auckland')
  })
})

describe('newDateZone: the fallback order', () => {
  it('falls to the browser zone only when the Space has never said', () => {
    pinBrowserZone('Europe/Lisbon')
    expect(newDateZone(null)).toBe('Europe/Lisbon')
    expect(newDateZone(undefined)).toBe('Europe/Lisbon')
    expect(newDateZone('')).toBe('Europe/Lisbon')
    expect(newDateZone('   ')).toBe('Europe/Lisbon')
  })

  it('falls to the house zone when the Space has never said AND the browser cannot say', () => {
    pinBrowserZone(null)
    expect(browserZone()).toBe('America/Los_Angeles')
    expect(newDateZone(null)).toBe('America/Los_Angeles')
  })

  it('never lets a half-written Space value become a date zone', () => {
    pinBrowserZone('Europe/Lisbon')
    // Whitespace is "not said", not a zone named " ".
    expect(newDateZone(' ')).not.toBe(' ')
  })
})
