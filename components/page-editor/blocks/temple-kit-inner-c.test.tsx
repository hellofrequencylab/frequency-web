import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { templeKitInnerCComponents } from './temple-kit-inner-c'

const links = { origin: 'https://frequency.example', slug: 'house', siteBase: '', pages: ['home', 'contact'], contactHref: '/contact', bookHref: null, email: null }
const draw = (props: Record<string, unknown>, metadata: Record<string, unknown> = {}) => {
  const c = templeKitInnerCComponents.TempleKitInnerPrograms
  return renderToStaticMarkup(<>{(c.render as (p: Record<string, unknown>) => React.ReactNode)({ ...c.defaultProps, ...props, puck: { metadata } })}</>)
}

describe('TempleKitInnerPrograms', () => {
  const items = [{ eyebrow: 'Breath · 4 weeks', title: 'Breath for a steadier week', host: 'With the house teachers', price: '$180', badge: 'Next run starts 3 Feb', href: '~/contact' }, { title: '' }]
  it('draws each program with its line, host, price and badge, linked through the site map', () => {
    const html = draw({ items }, { links })
    expect(html).toContain('Breath for a steadier week')
    expect(html).toContain('Breath · 4 weeks')
    expect(html).toContain('With the house teachers')
    expect(html).toContain('$180')
    expect(html).toContain('Next run starts 3 Feb')
    expect(html).toContain('href="/contact"')
    expect(html).toContain('1 programs')
  })
  it('draws nothing with no programs', () => {
    expect(draw({ items: [] })).toBe('')
  })
})
