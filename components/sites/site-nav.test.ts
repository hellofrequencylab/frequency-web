import { describe, expect, it } from 'vitest'
import { siteHasBooking, siteNavCss, siteSectionLinks } from './site-nav'

describe('siteSectionLinks', () => {
  it('builds the menu from the placed blocks, in page order', () => {
    expect(siteSectionLinks(['heading', 'story', 'offerings', 'booking', 'faq', 'contact'])).toEqual([
      { anchor: 'story', label: 'Story' },
      { anchor: 'offerings', label: 'Services' },
      { anchor: 'faq', label: 'FAQ' },
      { anchor: 'contact', label: 'Contact' },
    ])
  })

  it('skips decorative and unknown blocks and repeats', () => {
    expect(siteSectionLinks(['gallery', 'callout', 'faq', 'faq', 'nope'])).toEqual([{ anchor: 'faq', label: 'FAQ' }])
  })
})

describe('siteHasBooking', () => {
  it('is true only when a booking block is placed', () => {
    expect(siteHasBooking(['about', 'booking'])).toBe(true)
    expect(siteHasBooking(['about'])).toBe(false)
  })
})

describe('siteNavCss', () => {
  it('hides a link whose section rendered empty', () => {
    expect(siteNavCss(['faq'])).toBe(
      '[data-site-root]:not(:has(#faq:not(:empty))) [data-site-link="faq"]{display:none}',
    )
  })
})
