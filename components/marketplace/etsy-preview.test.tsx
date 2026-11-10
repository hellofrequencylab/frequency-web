import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { MarketplaceDiscoveryControls, MarketplaceShippingOptions } from './etsy-preview'

it('renders supplied shipping estimates as information only', () => {
  const html = renderToStaticMarkup(<MarketplaceShippingOptions options={[
    { id: 'standard', label: 'Standard', priceLabel: '$5.00', detail: '3–5 business days' },
    { id: 'pickup', label: 'Local pickup', priceLabel: 'Free' },
  ]} />)
  for (const copy of ['Shipping options', 'Standard', '$5.00', '3–5 business days', 'Local pickup', 'Free']) {
    expect(html).toContain(copy)
  }
  expect(html).not.toMatch(/<(form|button|input)\b/)
})

it('shows the unavailable state when no shipping options were supplied', () => {
  expect(renderToStaticMarkup(<MarketplaceShippingOptions options={[]} />))
    .toContain('Shipping options are unavailable.')
})

it('renders native labels, selected facet values and the selected sort without changing them', () => {
  const changeFacet = vi.fn()
  const changeSort = vi.fn()
  const html = renderToStaticMarkup(<MarketplaceDiscoveryControls
    facets={[
      { id: 'category', label: 'Category', options: [{ value: 'home', label: 'Home' }] },
      { id: 'tag', label: 'Tag', options: [{ value: 'handmade', label: 'Handmade' }] },
      { id: 'condition', label: 'Condition', options: [{ value: 'new', label: 'New' }] },
      { id: 'price', label: 'Price', options: [{ value: 'under-50', label: 'Under $50' }] },
      { id: 'sellerType', label: 'Seller type', options: [{ value: 'space', label: 'Space' }] },
    ]}
    values={{ category: 'home' }}
    sort="newest"
    onFacetChange={changeFacet}
    onSortChange={changeSort}
  />)
  for (const label of ['Category', 'Tag', 'Condition', 'Price', 'Seller type', 'Sort by']) {
    expect(html).toContain(label)
  }
  expect(html.match(/<select\b/g)).toHaveLength(6)
  expect(html).toContain('value="home" selected=""')
  expect(html).toContain('value="newest" selected=""')
  expect(changeFacet).not.toHaveBeenCalled()
  expect(changeSort).not.toHaveBeenCalled()
})
