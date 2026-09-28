import { describe, expect, it } from 'vitest'
import { readSkyMarkersEnabled, nextSkyMarkerPreferences } from './sky-markers'

describe('the per-Space sky marker opt-in', () => {
  // DEFAULT OFF is the whole point (owner decision): nobody wakes up with astrology on their
  // calendar. Absent, null, malformed and explicitly-false all have to read the same way.
  it('is off until a Space says otherwise', () => {
    expect(readSkyMarkersEnabled(undefined)).toBe(false)
    expect(readSkyMarkersEnabled(null)).toBe(false)
    expect(readSkyMarkersEnabled({})).toBe(false)
    expect(readSkyMarkersEnabled({ skyMarkers: false })).toBe(false)
    expect(readSkyMarkersEnabled({ other: 'thing' })).toBe(false)
  })

  it('is on only for a real true, never a truthy', () => {
    expect(readSkyMarkersEnabled({ skyMarkers: true })).toBe(true)
    // A stored string or number must NOT switch a public surface on by accident.
    for (const truthy of ['true', 1, 'yes', {}, []]) {
      expect(readSkyMarkersEnabled({ skyMarkers: truthy }), JSON.stringify(truthy)).toBe(false)
    }
  })

  it('survives a preferences blob that is not an object', () => {
    for (const junk of ['string', 42, [], true]) {
      expect(readSkyMarkersEnabled(junk), JSON.stringify(junk)).toBe(false)
    }
  })

  // SPARSE: off DELETES the key. A Space that never wanted this keeps a clean blob, and the stored
  // shape says only what an operator actually chose.
  it('writes sparsely: on sets the key, off removes it', () => {
    const on = nextSkyMarkerPreferences({}, true)
    expect(on).toEqual({ skyMarkers: true })
    const off = nextSkyMarkerPreferences(on, false)
    expect('skyMarkers' in off).toBe(false)
    expect(off).toEqual({})
  })

  it('never mutates the blob it was given, and keeps every other key', () => {
    const before = { storefront: { published: true }, coverFocus: '50% 20%' }
    const after = nextSkyMarkerPreferences(before, true)
    expect(after).not.toBe(before)
    expect(before).toEqual({ storefront: { published: true }, coverFocus: '50% 20%' })
    expect(after.storefront).toEqual({ published: true })
    expect(after.coverFocus).toBe('50% 20%')
    expect(after.skyMarkers).toBe(true)

    const cleared = nextSkyMarkerPreferences(after, false)
    expect(cleared.storefront).toEqual({ published: true })
    expect(cleared.coverFocus).toBe('50% 20%')
    expect('skyMarkers' in cleared).toBe(false)
  })

  it('round-trips through the reader', () => {
    expect(readSkyMarkersEnabled(nextSkyMarkerPreferences({}, true))).toBe(true)
    expect(readSkyMarkersEnabled(nextSkyMarkerPreferences({ skyMarkers: true }, false))).toBe(false)
  })

  it('starts from a clean object when handed junk', () => {
    expect(nextSkyMarkerPreferences('nonsense', true)).toEqual({ skyMarkers: true })
    expect(nextSkyMarkerPreferences(null, true)).toEqual({ skyMarkers: true })
  })
})
