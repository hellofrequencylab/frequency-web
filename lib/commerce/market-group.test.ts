import { describe, it, expect } from 'vitest'
import { marketGroupForKind } from './types'

describe('marketGroupForKind (ADR-593: Market umbrella typed rails)', () => {
  it('maps physical/digital to Products', () => {
    expect(marketGroupForKind('physical')).toBe('products')
    expect(marketGroupForKind('digital')).toBe('products')
  })

  it('maps service/booking to Services', () => {
    expect(marketGroupForKind('service')).toBe('services')
    expect(marketGroupForKind('booking')).toBe('services')
  })

  it('maps ticket to Tickets', () => {
    expect(marketGroupForKind('ticket')).toBe('tickets')
  })
})
