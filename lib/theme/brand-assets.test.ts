import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAND_ASSETS, brandAssets, brandmarkMaskStyle, DEFAULT_WORDMARK_SRC } from './brand-assets'
import { DESIGNS } from './design'

const PUBLIC = new URL('../../public', import.meta.url).pathname

describe('brand assets per design (ADR-1737)', () => {
  it('has an entry for every design, each naming files that exist', () => {
    for (const d of DESIGNS) {
      const a = BRAND_ASSETS[d.id]
      expect(a, d.id).toBeDefined()
      expect(existsSync(PUBLIC + a.wordmark.src), a.wordmark.src).toBe(true)
      expect(existsSync(PUBLIC + a.icon.src), a.icon.src).toBe(true)
    }
  })

  it('keeps DAWN on the files and aspect it has always shipped', () => {
    expect(brandAssets('dawn').wordmark).toEqual({ src: '/frequency-wordmark.png', width: 963, height: 130 })
    expect(DEFAULT_WORDMARK_SRC).toBe('/frequency-wordmark.png')
  })

  it('leaves the engraved header mark to the stylesheet until a design brings its own file', () => {
    expect(brandmarkMaskStyle(brandAssets('dawn'))).toBeUndefined()
    const style = brandmarkMaskStyle({
      wordmark: { src: '/other-mark.png', width: 800, height: 200 },
      icon: { src: '/icons/icon-512.png', size: 512 },
    })
    expect(style).toEqual({
      WebkitMaskImage: "url('/other-mark.png')",
      maskImage: "url('/other-mark.png')",
      aspectRatio: '800 / 200',
    })
  })
})
