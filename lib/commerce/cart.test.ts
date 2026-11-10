import { describe, expect, it } from 'vitest'
import { MAX_LINES, MAX_QTY_PER_LINE, addLine, lineKey, mergeCarts, parseCart, pruneCart, removeLine, setQty, type Cart } from './cart'

const L = (productId: string, qty = 1, variantId: string | null = null) => ({ productId, variantId, qty })

describe('cart model', () => {
  it('adds a new line and raises the quantity of an existing one', () => {
    let c: Cart = []
    c = addLine(c, L('a', 1)).cart
    c = addLine(c, L('a', 2)).cart
    c = addLine(c, L('a', 1, 'v1')).cart
    expect(c).toEqual([L('a', 3), L('a', 1, 'v1')])
  })
  it('clamps a quantity at the per-line cap and refuses a bad quantity', () => {
    const c = addLine([L('a', MAX_QTY_PER_LINE)], L('a', 5)).cart
    expect(c[0].qty).toBe(MAX_QTY_PER_LINE)
    expect(addLine([], L('a', 0)).refused).toBe('invalid-qty')
    expect(addLine([], L('a', Number.NaN)).refused).toBe('invalid-qty')
  })
  it('refuses a new line past the line cap but still raises an existing line', () => {
    const full: Cart = Array.from({ length: MAX_LINES }, (_, i) => L(`p${i}`))
    expect(addLine(full, L('extra')).refused).toBe('cart-full')
    expect(addLine(full, L('p0')).cart[0].qty).toBe(2)
  })
  it('sets and removes by key; zero or less removes', () => {
    const c: Cart = [L('a', 2), L('b', 1, 'v')]
    expect(setQty(c, lineKey(c[0]), 5)[0].qty).toBe(5)
    expect(setQty(c, lineKey(c[0]), 0)).toEqual([c[1]])
    expect(setQty(c, lineKey(c[0]), -3)).toEqual([c[1]])
    expect(removeLine(c, lineKey(c[1]))).toEqual([c[0]])
  })
  it('merges a guest cart under a signed-in cart, summing matches, member order first', () => {
    const m: Cart = [L('a', 1), L('b', 2)]
    const g: Cart = [L('c', 1), L('b', 3)]
    expect(mergeCarts(m, g)).toEqual([L('a', 1), L('b', 5), L('c', 1)])
  })
  it('does not mutate its inputs', () => {
    const m: Cart = [L('a', 1)]
    const snap = JSON.stringify(m)
    addLine(m, L('a', 1))
    setQty(m, lineKey(m[0]), 9)
    mergeCarts(m, [L('b')])
    expect(JSON.stringify(m)).toBe(snap)
  })
  it('prunes gone and sold-out items and clamps to stock, reporting each', () => {
    const c: Cart = [L('gone', 1), L('out', 1), L('low', 5), L('free', 7)]
    const avail = new Map([
      [lineKey(L('out')), { stock: 0 }],
      [lineKey(L('low')), { stock: 2 }],
      [lineKey(L('free')), { stock: null }],
    ])
    const { cart, report } = pruneCart(c, avail)
    expect(cart).toEqual([L('low', 2), L('free', 7)])
    expect(report.removed).toEqual([lineKey(L('gone')), lineKey(L('out'))])
    expect(report.reduced).toEqual([{ key: lineKey(L('low')), from: 5, to: 2 }])
  })
  it('drops malformed stored lines instead of repairing them', () => {
    const raw = [L('a', 2), null, 'x', { productId: '', qty: 1 }, { productId: 'b', qty: 0 }, { productId: 'c', variantId: 5, qty: 1 }, { productId: 'd', qty: 1 }]
    expect(parseCart(raw)).toEqual([L('a', 2), L('d', 1)])
    expect(parseCart('nope')).toEqual([])
  })
})
