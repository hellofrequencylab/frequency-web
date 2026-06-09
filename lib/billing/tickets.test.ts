import { describe, it, expect } from 'vitest'
import { ticketTotalCents } from './tickets'

// `ticketTotalCents` is the pure gross-amount derivation behind a ticket purchase.
describe('ticketTotalCents', () => {
  it('multiplies unit price by quantity', () => {
    expect(ticketTotalCents(1000, 1)).toBe(1000)
    expect(ticketTotalCents(1000, 3)).toBe(3000)
    expect(ticketTotalCents(250, 4)).toBe(1000)
  })

  it('floors a fractional quantity to whole tickets', () => {
    expect(ticketTotalCents(1000, 2.9)).toBe(2000)
  })

  it('returns 0 for a free/invalid price or non-positive quantity', () => {
    expect(ticketTotalCents(0, 2)).toBe(0)
    expect(ticketTotalCents(-100, 2)).toBe(0)
    expect(ticketTotalCents(NaN, 2)).toBe(0)
    expect(ticketTotalCents(1000, 0)).toBe(0)
    expect(ticketTotalCents(1000, -1)).toBe(0)
  })
})
