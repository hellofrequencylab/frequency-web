import { describe, it, expect } from 'vitest'
import { resolveSeatChange } from './operator-seats'

// The pure add/update/remove/noop decision for changing a Space's operator-seat count. The IO wrapper
// (updateOperatorSeats) applies these to the live Stripe subscription; only this decision is unit-tested.
describe('resolveSeatChange', () => {
  it('adds an item when there is none and the target is positive', () => {
    expect(resolveSeatChange(null, 3)).toEqual({ kind: 'add', quantity: 3 })
    expect(resolveSeatChange({ itemId: null, quantity: 0 }, 2)).toEqual({ kind: 'add', quantity: 2 })
  })

  it('is a no-op when there is no item and the target is zero', () => {
    expect(resolveSeatChange(null, 0)).toEqual({ kind: 'noop' })
  })

  it('removes the item when the target is zero and an item exists', () => {
    expect(resolveSeatChange({ itemId: 'si_1', quantity: 4 }, 0)).toEqual({ kind: 'remove', itemId: 'si_1' })
  })

  it('is a no-op when the target already matches the current quantity', () => {
    expect(resolveSeatChange({ itemId: 'si_1', quantity: 4 }, 4)).toEqual({ kind: 'noop' })
  })

  it('updates the quantity when the target differs (up or down)', () => {
    expect(resolveSeatChange({ itemId: 'si_1', quantity: 4 }, 6)).toEqual({ kind: 'update', itemId: 'si_1', quantity: 6 })
    expect(resolveSeatChange({ itemId: 'si_1', quantity: 4 }, 1)).toEqual({ kind: 'update', itemId: 'si_1', quantity: 1 })
  })

  it('floors and clamps a garbage / negative / fractional target', () => {
    expect(resolveSeatChange(null, -3)).toEqual({ kind: 'noop' })
    expect(resolveSeatChange({ itemId: 'si_1', quantity: 4 }, 2.9)).toEqual({ kind: 'update', itemId: 'si_1', quantity: 2 })
    expect(resolveSeatChange(null, Number.NaN)).toEqual({ kind: 'noop' })
  })
})
