import { describe, expect, it } from 'vitest'
import { spotlightLinkLabels, spotlightLinkTarget } from './spotlight-link-target'

describe('spotlightLinkTarget (LIVE-2327)', () => {
  it('is stable, short and per address', () => {
    const a = spotlightLinkTarget('https://example.com/a')
    expect(a).toMatch(/^link:[0-9a-z]{1,7}$/)
    expect(spotlightLinkTarget('https://example.com/a')).toBe(a)
    expect(spotlightLinkTarget('https://example.com/b')).not.toBe(a)
  })
})

describe('spotlightLinkLabels (LIVE-2327)', () => {
  it('maps each saved link to its label, the address when unlabeled, and skips unsafe ones', () => {
    const labels = spotlightLinkLabels([
      {
        items: [
          { label: 'Shop', url: 'https://x.com/shop' },
          { label: '', url: 'https://x.com/blog' },
          { label: 'Bad', url: 'javascript:alert(1)' },
        ],
      },
      undefined,
    ])
    expect(labels.get(spotlightLinkTarget('https://x.com/shop'))).toBe('Shop')
    expect(labels.get(spotlightLinkTarget('https://x.com/blog'))).toBe('https://x.com/blog')
    expect(labels.size).toBe(2)
  })
})
