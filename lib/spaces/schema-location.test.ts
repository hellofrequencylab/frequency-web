import { describe, it, expect } from 'vitest'
import { spaceSchemaLocation } from './schema-location'
import { approximatePoint } from '@/lib/maps/approximate'

const base = {
  id: 'space-1',
  city: 'Carlsbad',
  street: '300 Carlsbad Village Dr',
  region: 'CA',
  postalCode: '92008',
  country: 'US',
  latitude: 33.1581,
  longitude: -117.3506,
  locationPrecision: 'exact' as const,
}

describe('spaceSchemaLocation (SCAN-809)', () => {
  it('an exact pin publishes the full address and the true coordinate', () => {
    const out = spaceSchemaLocation(base)
    expect(out.address).toEqual({
      streetAddress: '300 Carlsbad Village Dr',
      addressLocality: 'Carlsbad',
      addressRegion: 'CA',
      postalCode: '92008',
      addressCountry: 'US',
    })
    expect(out.geo).toEqual({ latitude: 33.1581, longitude: -117.3506 })
  })

  it('an approximate pin withholds the street and ZIP and publishes the coarsened cell the map draws', () => {
    const out = spaceSchemaLocation({ ...base, locationPrecision: 'approximate' })
    expect(out.address).toEqual({ addressLocality: 'Carlsbad', addressRegion: 'CA', addressCountry: 'US' })
    const cell = approximatePoint(base.latitude, base.longitude, base.id)!
    expect(out.geo).toEqual({ latitude: cell.lat, longitude: cell.lng })
    expect(out.geo).not.toEqual({ latitude: base.latitude, longitude: base.longitude })
  })

  it('falls back to the Contact card street when the location form has none, and only at exact precision', () => {
    const noStreet = { ...base, street: null }
    expect(spaceSchemaLocation(noStreet, ' 1 Main St ').address?.streetAddress).toBe('1 Main St')
    expect(spaceSchemaLocation({ ...noStreet, locationPrecision: 'approximate' }, '1 Main St').address?.streetAddress).toBeUndefined()
  })

  it('a Space with no place at all emits no address block and no geo', () => {
    const out = spaceSchemaLocation({
      id: 'x', city: null, street: null, region: null, postalCode: null, country: null,
      latitude: null, longitude: null, locationPrecision: 'exact',
    })
    expect(out).toEqual({ address: null, geo: null })
  })

  it('a half pair or a non-finite coordinate emits no geo', () => {
    expect(spaceSchemaLocation({ ...base, longitude: null }).geo).toBeNull()
    expect(spaceSchemaLocation({ ...base, latitude: Number.NaN }).geo).toBeNull()
  })
})
