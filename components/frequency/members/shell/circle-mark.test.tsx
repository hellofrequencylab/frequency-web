import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CircleMark } from './circle-mark'

// LIVE-1013: a Circle in Your Circles wears its own picture, and its initial when it has none.
describe('CircleMark', () => {
  it('draws the Circle picture as a decorative image', () => {
    const html = renderToStaticMarkup(<CircleMark label="Wildheart" image="/img/w.jpg" />)
    expect(html).toContain('class="fqm-circle-img"')
    expect(html).toContain('src="/img/w.jpg"')
    expect(html).toContain('alt=""')
  })

  it('falls back to the initial', () => {
    expect(renderToStaticMarkup(<CircleMark label="Wildheart" image={null} />)).toBe('W')
  })
})
