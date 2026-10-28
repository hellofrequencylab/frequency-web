import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { templeKitInnerBComponents } from './temple-kit-inner-b'

const links = { origin: 'https://frequency.example', slug: 'house', siteBase: '', pages: ['home', 'contact'], contactHref: '/contact', bookHref: null, email: null }
const draw = (type: string, props: Record<string, unknown>, metadata: Record<string, unknown> = {}) => {
  const c = templeKitInnerBComponents[type]
  return renderToStaticMarkup(<>{(c.render as (p: Record<string, unknown>) => React.ReactNode)({ ...c.defaultProps, ...props, puck: { metadata } })}</>)
}

describe('TempleKitInnerTiers', () => {
  const tiers = [
    { name: 'Circle', monthly: '$54', yearly: '$540', intro: 'First month $27', perks: 'One\nTwo', featured: true, badge: 'Most chosen', ctaLabel: 'Join Circle', ctaHref: '~/contact' },
    { name: 'Keeper', monthly: '$220', perks: 'Everything in Circle' },
  ]
  it('draws each rung with its monthly price, perks, badge and a link through the site map', () => {
    const html = draw('TempleKitInnerTiers', { tiers }, { links })
    expect(html).toContain('Circle')
    expect(html).toContain('$54')
    expect(html).toContain('Most chosen')
    expect(html).toContain('First month $27')
    expect(html).toContain('href="/contact"')
    expect(html).toContain('aria-pressed')
  })
  it('hides the switch when no rung has a yearly price, and draws nothing with no rungs', () => {
    expect(draw('TempleKitInnerTiers', { tiers: [{ name: 'Keeper', monthly: '$220' }] })).not.toContain('aria-pressed')
    expect(draw('TempleKitInnerTiers', { tiers: [] })).toBe('')
  })
})

describe('TempleKitInnerGatherings', () => {
  const items = [{ when: 'Thu 20 Nov', title: 'New moon sound bath', price: '$45', summary: 'Gongs and bowls.' }]
  it('draws the typed cards when the Space has no events', () => {
    const html = draw('TempleKitInnerGatherings', { items })
    expect(html).toContain('New moon sound bath')
    expect(html).toContain('1 upcoming')
  })
  it('draws the Space events over the typed cards, linked, and drops a cancelled one', () => {
    const events = [
      { id: 'a', slug: 'dinner', title: 'Community Dinner', startsAt: '2099-10-25T17:00:00.000Z', endsAt: '2099-10-25T19:00:00.000Z', priceLabel: '$22' },
      { id: 'b', slug: 'gone', title: 'Cancelled Dinner', startsAt: '2099-10-26T17:00:00.000Z', isCancelled: true },
    ]
    const html = draw('TempleKitInnerGatherings', { items }, { space: { events, series: [] }, links })
    expect(html).toContain('Community Dinner')
    expect(html).toContain('href="https://frequency.example/events/dinner"')
    expect(html).toContain('$22')
    expect(html).not.toContain('Cancelled Dinner')
    expect(html).not.toContain('New moon sound bath')
  })
  it('draws nothing with neither events nor cards', () => {
    expect(draw('TempleKitInnerGatherings', { items: [] })).toBe('')
  })
})
