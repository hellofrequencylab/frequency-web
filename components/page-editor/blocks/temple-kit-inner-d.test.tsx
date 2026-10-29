import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { templeKitInnerDComponents } from './temple-kit-inner-d'

const links = { origin: 'https://frequency.example', slug: 'house', siteBase: '', pages: ['home', 'contact'], contactHref: '/contact', bookHref: null, email: null }
const draw = (type: string, props: Record<string, unknown>, metadata: Record<string, unknown> = {}) => {
  const c = templeKitInnerDComponents[type]
  return renderToStaticMarkup(<>{(c.render as (p: Record<string, unknown>) => React.ReactNode)({ ...c.defaultProps, ...props, puck: { metadata } })}</>)
}

describe('TempleKitInnerShop', () => {
  const items = [
    { kind: 'Objects', title: 'Beeswax taper candles', price: '$38', meta: 'Set of six', href: '~/contact' },
    { kind: 'Gifts', title: 'Gift card', price: 'From $50', badge: 'Gift' },
    { title: '' },
  ]
  it('draws each product with its price, badge and a link through the site map, with a tab per kind', () => {
    const html = draw('TempleKitInnerShop', { items }, { links })
    expect(html).toContain('Beeswax taper candles')
    expect(html).toContain('$38')
    expect(html).toContain('From $50')
    expect(html).toContain('href="/contact"')
    expect(html).toContain('aria-pressed')
    expect(html).toContain('2 items')
  })
  it('hides the tabs with one kind, and draws nothing with no products', () => {
    expect(draw('TempleKitInnerShop', { items: [items[0]] })).not.toContain('aria-pressed')
    expect(draw('TempleKitInnerShop', { items: [] })).toBe('')
  })
})

describe('TempleKitInnerLibrary', () => {
  const items = [
    { kind: 'Guides', title: 'Planning a gathering', meta: 'Guide, PDF', ctaLabel: 'Download', href: '~/contact' },
    { kind: 'Recordings', title: 'A long sound bath', price: '$12', ctaLabel: 'Buy', href: '~/contact' },
  ]
  it('numbers the shelf, reads an empty price as free and links the button', () => {
    const html = draw('TempleKitInnerLibrary', { items }, { links })
    expect(html).toContain('01')
    expect(html).toContain('Free')
    expect(html).toContain('$12')
    expect(html).toContain('href="/contact"')
    expect(html).toContain('2 on the shelves')
  })
  it('draws nothing with an empty shelf', () => {
    expect(draw('TempleKitInnerLibrary', { items: [] })).toBe('')
  })
})
