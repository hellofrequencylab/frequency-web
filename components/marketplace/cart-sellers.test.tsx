import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildCartView } from '@/lib/commerce/cart-view'
import type { CommerceProduct } from '@/lib/commerce/types'

vi.mock('@/components/marketplace/cart-line-controls', () => ({
  CartLineControls: ({ lineKey }: { lineKey: string }) => <span data-controls={lineKey} />,
}))

import { CartSellers } from './cart-sellers'

const product = (o: Partial<CommerceProduct> & { id: string }): CommerceProduct =>
  ({
    title: o.id,
    images: [],
    priceCents: 1000,
    currency: 'usd',
    stock: null,
    status: 'active',
    ownerKind: 'space',
    ownerProfileId: null,
    ownerSpaceId: 's1',
    productKind: 'physical',
    ...o,
  }) as CommerceProduct
const view = (...ps: CommerceProduct[]) =>
  buildCartView(
    ps.map((p) => ({ productId: p.id, variantId: null, qty: 1 })),
    new Map(ps.map((p) => [p.id, p])),
    new Map(),
  )
const names = new Map([
  ['space:s1', 'Clay House'],
  ['space:s2', 'Tide Goods'],
])
const html = (v: ReturnType<typeof view>, n: ReadonlyMap<string, string> = names) => renderToStaticMarkup(<CartSellers view={v} names={n} />)

describe('CartSellers', () => {
  it('puts each line under the seller who sells it, with a subtotal per seller', () => {
    const out = html(view(product({ id: 'mug', priceCents: 1200 }), product({ id: 'towel', ownerSpaceId: 's2', priceCents: 800 }), product({ id: 'bowl', priceCents: 300 })))
    const [first, second] = out.split('data-cart-seller=').slice(1)
    expect(first).toContain('Sold by Clay House')
    expect(first).toContain('data-cart-line="mug:"')
    expect(first).toContain('data-cart-line="bowl:"')
    expect(first).toContain('$15.00')
    expect(second).toContain('Sold by Tide Goods')
    expect(second).toContain('data-cart-line="towel:"')
    expect(out).toContain('2 sellers are in this cart. You pay once, and each seller sends their own items.')
  })

  it('says nothing about several sellers when there is one, and still names the seller', () => {
    const out = html(view(product({ id: 'mug' })))
    expect(out).toContain('Sold by Clay House')
    expect(out).not.toContain('sellers are in this cart')
    expect(out).not.toContain('data-cart-blocked')
  })

  it('tells the buyer an address is asked for only when something ships', () => {
    expect(html(view(product({ id: 'mug' })))).toContain('You enter your address on the secure payment page.')
    expect(html(view(product({ id: 'guide', productKind: 'digital' })))).not.toContain('data-cart-shipping')
  })

  it('says why a cart cannot be paid as it stands, before the buyer presses anything', () => {
    expect(html(view(product({ id: 'a' }), product({ id: 'b', currency: 'eur' })))).toContain('data-cart-blocked="mixed_currency"')
    const storeMix = html(view(product({ id: 'a' }), product({ id: 'tee', ownerKind: 'platform', ownerSpaceId: null })))
    expect(storeMix).toContain('data-cart-blocked="store_with_others"')
    expect(storeMix).toContain('Sold by Frequency Store')
    const contact = html(view(product({ id: 'a' }), product({ id: 'lamp', ownerKind: 'profile', ownerSpaceId: null, ownerProfileId: 'p9' })))
    expect(contact).toContain('data-cart-blocked="contact_only"')
    expect(contact).toContain('Contact only. Message this seller to arrange payment and pickup.')
    expect(contact).toContain('Sold by A member')
  })

  it('falls back to a plain label when a name could not be read, and uses no em dash', () => {
    const out = html(view(product({ id: 'mug' })), new Map())
    expect(out).toContain('Sold by A Space shop')
    expect(out).not.toContain('—')
  })
})
