import { describe, it, expect } from 'vitest'
import {
  normalizeVital,
  normalizeVitalBatch,
  templatePath,
  MAX_VITALS_BATCH,
} from './vitals'

const good = {
  name: 'LCP',
  value: 1843.4,
  rating: 'good',
  id: 'v5-123-7',
  navigationType: 'navigate',
  path: '/pricing',
  t: 1754000000000,
}

describe('normalizeVital', () => {
  it('accepts a well-formed metric and rounds time to whole ms', () => {
    const v = normalizeVital(good)
    expect(v).not.toBeNull()
    expect(v!.value).toBe(1843)
    expect(v!.name).toBe('LCP')
  })

  it('keeps 4 decimals for CLS and clamps at 10', () => {
    expect(normalizeVital({ ...good, name: 'CLS', value: 0.12345678 })!.value).toBe(0.1235)
    expect(normalizeVital({ ...good, name: 'CLS', value: 99 })!.value).toBe(10)
  })

  it('clamps time metrics at 10 minutes', () => {
    expect(normalizeVital({ ...good, value: 10_000_000 })!.value).toBe(600_000)
  })

  it('rejects unknown metric names, bad ratings, and non-finite values', () => {
    expect(normalizeVital({ ...good, name: 'FID' })).toBeNull()
    expect(normalizeVital({ ...good, rating: 'great' })).toBeNull()
    expect(normalizeVital({ ...good, value: NaN })).toBeNull()
    expect(normalizeVital({ ...good, value: -5 })).toBeNull()
    expect(normalizeVital({ ...good, id: '' })).toBeNull()
    expect(normalizeVital(null)).toBeNull()
  })

  it('never lets a PerformanceEntry list survive normalization', () => {
    const v = normalizeVital({ ...good, entries: [{ big: 'object' }] })
    expect(v).not.toBeNull()
    expect('entries' in v!).toBe(false)
  })
})

describe('normalizeVitalBatch', () => {
  it('caps the batch and drops invalid entries', () => {
    const raw = Array.from({ length: 20 }, (_, i) =>
      i % 2 ? { ...good, id: `m-${i}` } : { junk: true },
    )
    const out = normalizeVitalBatch(raw)
    expect(out.length).toBeLessThanOrEqual(MAX_VITALS_BATCH)
    expect(out.every((v) => v.name === 'LCP')).toBe(true)
  })

  it('returns [] for non-arrays', () => {
    expect(normalizeVitalBatch({})).toEqual([])
    expect(normalizeVitalBatch('x')).toEqual([])
  })
})

describe('templatePath', () => {
  it('collapses uuids, numeric ids, and long slugs to :id', () => {
    expect(templatePath('/circles/8f14e45f-ceea-4a12-a2b3-1234567890ab')).toBe('/circles/:id')
    expect(templatePath('/events/12345')).toBe('/events/:id')
    expect(templatePath('/spaces/a-very-long-generated-slug-name-here')).toBe('/spaces/:id')
  })

  it('keeps ordinary route segments', () => {
    expect(templatePath('/discover/events')).toBe('/discover/events')
    expect(templatePath('/pricing')).toBe('/pricing')
  })
})
