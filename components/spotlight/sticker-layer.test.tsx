import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpotlightStickerLayer } from './sticker-layer'
import { EMPTY_STICKERS } from '@/lib/spotlight/blocks/schema'

// The sticker layer (ADR-1275). What these lock: an empty layer renders NOTHING (so no existing
// Spotlight's markup or visual baseline moves), a placed layer is decorative chrome (aria-hidden,
// pointer-events none), positions are the stored percentages, and an id the allowlist does not
// know draws nothing even if it somehow reaches the renderer.

describe('SpotlightStickerLayer', () => {
  it('renders nothing at all for an empty layer', () => {
    expect(renderToStaticMarkup(<SpotlightStickerLayer stickers={EMPTY_STICKERS} />)).toBe('')
    expect(renderToStaticMarkup(<SpotlightStickerLayer stickers={{ items: [] }} />)).toBe('')
  })

  it('renders each placed sticker at its percentage, as decorative chrome', () => {
    const html = renderToStaticMarkup(
      <SpotlightStickerLayer stickers={{ items: [{ id: 'star', x: 12, y: 88 }, { id: 'heart', x: 0, y: 100 }] }} />,
    )
    expect(html).toContain('aria-hidden')
    expect(html).toContain('pointer-events-none')
    expect(html).toContain('⭐')
    expect(html).toContain('❤️')
    expect(html).toContain('left:12%')
    expect(html).toContain('top:88%')
    expect(html).toContain('left:0%')
    expect(html).toContain('top:100%')
  })

  it('draws nothing for an id the allowlist does not know, and nothing at all when none are known', () => {
    const html = renderToStaticMarkup(
      <SpotlightStickerLayer stickers={{ items: [{ id: 'skull', x: 50, y: 50 }, { id: 'star', x: 1, y: 2 }] }} />,
    )
    expect(html).not.toContain('skull')
    expect(html).toContain('⭐')
    expect(renderToStaticMarkup(<SpotlightStickerLayer stickers={{ items: [{ id: 'skull', x: 50, y: 50 }] }} />)).toBe('')
  })
})
