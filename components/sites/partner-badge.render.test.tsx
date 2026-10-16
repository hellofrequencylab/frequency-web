import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PartnerBadge } from './site-chrome'

describe('PartnerBadge', () => {
  it('links to the Frequency Spaces page with its label', () => {
    const html = renderToStaticMarkup(<PartnerBadge />)
    expect(html).toMatch(/href="[^"]*\/spaces"/)
    expect(html).toContain('class="hs-partner"')
    expect(html).toContain('Frequency <b>Partner</b>')
  })
})
