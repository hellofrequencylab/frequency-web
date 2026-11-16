import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CommerceVariant } from '@/lib/commerce/types'

vi.mock('@/app/(main)/marketplace/buy-button', () => ({
  BuyButton: ({ variantId }: { variantId?: string | null }) => <span data-buy={variantId ?? ''} />,
}))
vi.mock('@/app/(main)/marketplace/add-to-cart-button', () => ({
  AddToCartButton: ({ productId, variantId }: { productId: string; variantId?: string | null }) => <span data-add={`${productId}:${variantId ?? ''}`} />,
}))

import { VariantPicker } from './variant-picker'

const variant = (o: Partial<CommerceVariant> & { id: string }): CommerceVariant =>
  ({ productId: 'p1', name: o.id, options: {}, priceCents: null, stock: null, sku: null, sortOrder: 0, active: true, ...o }) as CommerceVariant
const render = (variants: CommerceVariant[], cart?: boolean) =>
  renderToStaticMarkup(<VariantPicker productId="p1" priceCents={1000} currency="usd" variants={variants} cart={cart} />)

it('offers no Add to cart while the cart switch is off', () => {
  const html = render([variant({ id: 'small' })])
  expect(html).toContain('data-buy="small"')
  expect(html).not.toContain('data-add')
})

it('adds the chosen option, the first one in stock, when the cart is on', () => {
  const html = render([variant({ id: 'small', stock: 0 }), variant({ id: 'large' })], true)
  expect(html).toContain('data-add="p1:large"')
})

it('offers neither Buy nor Add to cart for an option that is sold out', () => {
  const html = render([variant({ id: 'small', stock: 0 })], true)
  expect(html).toContain('This option is sold out.')
  expect(html).not.toContain('data-add')
  expect(html).not.toContain('data-buy')
})
