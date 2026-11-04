import { describe, expect, it } from 'vitest'
import { SERVICES_SITE_CSS } from './services-css'

// THE PHOTO HERO ON A SPACE WEBSITE (owner, 2026-11-04, on the Vanta site): the Space document wraps each block in the page rhythm
// (py-8, sm:py-10), which drew a 40px ink band above the photo hero under the header. The Services sheet zeroes that wrapper, the
// hero fits one viewport and the services box stops at 440px from its left edge. The rest is the kit's own (owner, later that day:
// "The Vanta logo and hero aren't like the design system"): the overlay scrim, the dot eyebrow, the lit italic, the caps buttons, the
// accent header button and the wordmark sized by the name's length (Logo.jsx: 112 / max(4.2, letters x 0.6)).
describe('the Services photo hero', () => {
  it('runs the sections flush under the header', () => {
    expect(SERVICES_SITE_CSS).toContain('[data-house-theme="services"] [data-mw-own]>div{padding-block:0}')
  })
  it('wears the kit\'s photo hero and bar header', () => {
    expect(SERVICES_SITE_CSS).toContain('.sv-hero-bg--photo::before{content:"";position:absolute;inset:0;z-index:1;background:var(--sv-overlay-scrim)}')
    expect(SERVICES_SITE_CSS).toContain('.sv-hero-copy .sv-display em{background:var(--sv-grad-lit)')
    expect(SERVICES_SITE_CSS).toContain('font-size:calc(112px / max(4.2, var(--sv-wm-len, 5) * .6))')
    expect(SERVICES_SITE_CSS).toMatch(/\.hs-header-actions \.hs-btn\{[^}]*background:var\(--sv-accent\)/)
    expect(SERVICES_SITE_CSS).toMatch(/\.sv-btn\{[^}]*font-family:var\(--sv-font-display\);[^}]*text-transform:uppercase/)
    expect(SERVICES_SITE_CSS).not.toContain('.hs-header{border-bottom:0}')
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
