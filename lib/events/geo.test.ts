import { describe, it, expect } from 'vitest'
import { pointFromGeog } from './geo'

describe('pointFromGeog', () => {
  it('decodes the EWKB hex string PostgREST returns for a geography point', () => {
    // The real value stored for an event (SRID 4326, little-endian, with SRID flag).
    const hex = '0101000020E610000071602816AE525DC085D9BA8A7B844040'
    const pt = pointFromGeog(hex)
    expect(pt).not.toBeNull()
    expect(pt!.lat).toBeCloseTo(33.0350202, 5)
    expect(pt!.lng).toBeCloseTo(-117.2918754, 5)
  })

  it('reads a GeoJSON object form ({coordinates:[lng,lat]})', () => {
    const pt = pointFromGeog({ type: 'Point', coordinates: [-117.2918754, 33.0350202] })
    expect(pt).toEqual({ lat: 33.0350202, lng: -117.2918754 })
  })

  it('returns null for null / undefined / empty', () => {
    expect(pointFromGeog(null)).toBeNull()
    expect(pointFromGeog(undefined)).toBeNull()
    expect(pointFromGeog('')).toBeNull()
  })

  it('returns null for garbage strings and out-of-range points', () => {
    expect(pointFromGeog('not-hex')).toBeNull()
    expect(pointFromGeog('00')).toBeNull()
    // A malformed/short hex must not throw.
    expect(pointFromGeog('0101000020E6100000')).toBeNull()
  })

  it('handles a WKB point with no embedded SRID', () => {
    // 0101000000 = point, little-endian, no SRID flag; then lng (LE double) then lat (LE double).
    // lng = 12.5 (0x4029000000000000 → LE bytes 0000000000002940), lat = -0.125 (0xBFC0… → LE c0bf).
    const hex = '0101000000' + '0000000000002940' + '000000000000c0bf'
    const pt = pointFromGeog(hex)
    expect(pt).not.toBeNull()
    expect(pt!.lng).toBeCloseTo(12.5, 6)
    expect(pt!.lat).toBeCloseTo(-0.125, 6)
  })
})
