import { describe, expect, it } from 'vitest'
import { SERVICES_SITE_CSS } from './services-css'

// THE PHOTO HERO ON A SPACE WEBSITE (owner, 2026-11-04, on the Vanta site): the Space document wraps each block in the page rhythm
// (py-8, sm:py-10), which drew a 40px ink band above the photo hero under the header. The Services sheet zeroes that wrapper, the
// header loses its hairline over a photo, the hero fits one viewport and the services box stops at 440px from its left edge.
describe('the Services photo hero', () => {
  it('runs the sections flush under the header', () => {
    expect(SERVICES_SITE_CSS).toContain('[data-house-theme="services"] [data-mw-own]>div{padding-block:0}')
    expect(SERVICES_SITE_CSS).toContain('[data-house-theme="services"]:has(.sv-hero-bg--photo) .hs-header{border-bottom:0}')
  })
  it('fits one viewport and keeps the services box narrow', () => {
    expect(SERVICES_SITE_CSS).toMatch(/\.sv-hero--photo\{min-height:min\(100svh,\d+px\)\}/)
    expect(SERVICES_SITE_CSS).toContain('.sv-hero--photo .sv-panel{justify-self:start;width:min(100%,440px)}')
  })
  it('keeps every colour on a token', () => {
    const block = SERVICES_SITE_CSS.slice(SERVICES_SITE_CSS.indexOf('[data-mw-own]>div{'), SERVICES_SITE_CSS.indexOf('.sv-proof{'))
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})
