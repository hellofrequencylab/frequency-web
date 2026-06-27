import { describe, it, expect } from 'vitest'
import { validateSpotlightLayout, validateSpotlightBackground } from './validate'
import { MAX_BLOCKS } from './schema'

const OWNER = '8b0d1087-ed37-4bc4-8439-8a109de1a48d'

describe('validateSpotlightLayout — security boundary', () => {
  it('never throws on garbage input', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { blocks: 'nope' }, { blocks: [null, 1, 'x'] }]) {
      expect(() => validateSpotlightLayout(junk, OWNER)).not.toThrow()
    }
    expect(validateSpotlightLayout(null, OWNER).blocks).toEqual([])
  })

  it('caps at MAX_BLOCKS', () => {
    const blocks = Array.from({ length: 500 }, (_, i) => ({ type: 'text', text: `t${i}` }))
    expect(validateSpotlightLayout({ blocks }, OWNER).blocks.length).toBe(MAX_BLOCKS)
  })

  it('drops a javascript: link and keeps a safe https one', () => {
    const out = validateSpotlightLayout(
      { blocks: [{ type: 'links', items: [
        { label: 'evil', url: 'javascript:alert(1)' },
        { label: 'ok', url: 'https://example.com' },
      ] }] },
      OWNER,
    )
    expect(out.blocks).toHaveLength(1)
    const links = out.blocks[0]
    expect(links.type).toBe('links')
    if (links.type === 'links') {
      expect(links.items).toHaveLength(1)
      expect(links.items[0].url).toContain('https://example.com')
    }
  })

  it('drops an image with a foreign or traversal assetPath, keeps the owner-scoped one', () => {
    const out = validateSpotlightLayout(
      { blocks: [
        { type: 'image', assetPath: '../secrets/x.png', alt: 'a' },
        { type: 'image', assetPath: 'someone-else/spotlight/x.png', alt: 'a' },
        { type: 'image', assetPath: `${OWNER}/spotlight/pic_a1.webp`, alt: 'mine' },
      ] },
      OWNER,
    )
    expect(out.blocks).toHaveLength(1)
    expect(out.blocks[0].type).toBe('image')
  })

  it('drops unknown block types entirely (no echo fallback)', () => {
    const out = validateSpotlightLayout({ blocks: [{ type: 'iframe', src: 'evil' }, { type: 'divider' }] }, OWNER)
    expect(out.blocks).toHaveLength(1)
    expect(out.blocks[0].type).toBe('divider')
  })

  it('clamps heading/text length and drops empty', () => {
    const out = validateSpotlightLayout(
      { blocks: [{ type: 'heading', text: 'x'.repeat(500) }, { type: 'text', text: '   ' }] },
      OWNER,
    )
    expect(out.blocks).toHaveLength(1)
    const h = out.blocks[0]
    if (h.type === 'heading') expect(h.text.length).toBeLessThanOrEqual(80)
  })
})

describe('validateSpotlightBackground', () => {
  it('clamps dim to 0..80 and rejects a foreign path', () => {
    expect(validateSpotlightBackground({ assetPath: 'evil/x.png', dim: 999 }, OWNER)).toEqual({ assetPath: null, dim: 80 })
    expect(validateSpotlightBackground({ assetPath: `${OWNER}/spotlight/bg.webp`, dim: -5 }, OWNER))
      .toEqual({ assetPath: `${OWNER}/spotlight/bg.webp`, dim: 0 })
  })
})
