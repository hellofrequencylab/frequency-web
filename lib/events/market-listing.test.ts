import { describe, it, expect } from 'vitest'
import {
  readEventMarketListed,
  writeEventMarketListed,
  listableOnly,
} from './market-listing'

// Public listing (ADR-844). Listed is the DEFAULT, and the key only ever exists on an opt-out,
// so every event that predates the control keeps listing exactly as it did.

describe('readEventMarketListed', () => {
  it('defaults to listed when the theme has no key', () => {
    expect(readEventMarketListed({})).toBe(true)
    expect(readEventMarketListed({ coverFocus: '50% 20%' })).toBe(true)
  })

  it('defaults to listed for a missing or non-object theme', () => {
    expect(readEventMarketListed(null)).toBe(true)
    expect(readEventMarketListed(undefined)).toBe(true)
    expect(readEventMarketListed('nonsense')).toBe(true)
  })

  it('opts out only on an explicit false', () => {
    expect(readEventMarketListed({ marketListed: false })).toBe(false)
  })

  it('fails OPEN on a malformed value rather than hiding the host event', () => {
    expect(readEventMarketListed({ marketListed: 'false' })).toBe(true)
    expect(readEventMarketListed({ marketListed: 0 })).toBe(true)
    expect(readEventMarketListed({ marketListed: null })).toBe(true)
  })
})

describe('writeEventMarketListed', () => {
  it('stores false when opting out', () => {
    expect(writeEventMarketListed({}, false)).toEqual({ marketListed: false })
  })

  it('DELETES the key when relisting, so the default stays a true default', () => {
    expect(writeEventMarketListed({ marketListed: false }, true)).toEqual({})
  })

  it('preserves the rest of the theme bag both ways', () => {
    const theme = { coverFocus: '50% 12%', heroHeight: 'tall' }
    expect(writeEventMarketListed(theme, false)).toEqual({ ...theme, marketListed: false })
    expect(writeEventMarketListed({ ...theme, marketListed: false }, true)).toEqual(theme)
  })

  it('round-trips through the reader', () => {
    const off = writeEventMarketListed({}, false)
    expect(readEventMarketListed(off)).toBe(false)
    expect(readEventMarketListed(writeEventMarketListed(off, true))).toBe(true)
  })

  it('tolerates a missing or non-object theme', () => {
    expect(writeEventMarketListed(null, false)).toEqual({ marketListed: false })
    expect(writeEventMarketListed('nonsense', false)).toEqual({ marketListed: false })
  })
})

describe('listableOnly', () => {
  it('keeps everything that never touched the control', () => {
    const rows = [{ id: 'a', theme: null }, { id: 'b', theme: {} }, { id: 'c' }]
    expect(listableOnly(rows).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops only the explicit opt-outs', () => {
    const rows = [
      { id: 'listed', theme: {} },
      { id: 'opted-out', theme: { marketListed: false } },
      { id: 'also-listed', theme: { coverFocus: '50% 0%' } },
    ]
    expect(listableOnly(rows).map((r) => r.id)).toEqual(['listed', 'also-listed'])
  })

  it('returns an empty list unchanged', () => {
    expect(listableOnly([])).toEqual([])
  })
})
