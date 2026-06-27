import { describe, it, expect } from 'vitest'
import { validateSpotlightLayout, validateSpotlightBackground } from './validate'
import { MAX_BLOCKS, MAX_GALLERY_IMAGES } from './schema'

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

  it('gallery: drops foreign-path items, caps count, drops an all-foreign (empty) gallery', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ assetPath: `${OWNER}/spotlight/g${i}.webp`, alt: '' }))
    const out = validateSpotlightLayout(
      { blocks: [
        { type: 'gallery', items: [
          { assetPath: '../escape.png', alt: 'x' },
          { assetPath: 'someone-else/spotlight/x.png', alt: 'x' },
          { assetPath: `${OWNER}/spotlight/ok.gif`, alt: 'mine' },
        ] },
        { type: 'gallery', items: many },
        { type: 'gallery', items: [{ assetPath: 'evil/x.png', alt: 'x' }] },
      ] },
      OWNER,
    )
    // first gallery keeps only the owner-scoped item; second is capped; third drops whole.
    expect(out.blocks).toHaveLength(2)
    const first = out.blocks[0]
    if (first.type === 'gallery') expect(first.items).toHaveLength(1)
    const second = out.blocks[1]
    if (second.type === 'gallery') expect(second.items).toHaveLength(MAX_GALLERY_IMAGES)
  })

  it('quote: drops empty, keeps optional cite', () => {
    const out = validateSpotlightLayout(
      { blocks: [
        { type: 'quote', text: '   ' },
        { type: 'quote', text: 'Stay weird.', cite: 'Someone' },
      ] },
      OWNER,
    )
    expect(out.blocks).toHaveLength(1)
    const q = out.blocks[0]
    expect(q.type).toBe('quote')
    if (q.type === 'quote') { expect(q.text).toBe('Stay weird.'); expect(q.cite).toBe('Someone') }
  })

  it('stats: filters unknown keys, dedupes, drops an empty selection', () => {
    const out = validateSpotlightLayout(
      { blocks: [
        { type: 'stats', show: ['streak', 'streak', 'evil', 'gems'] },
        { type: 'stats', show: ['nonsense'] },
        { type: 'stats', show: [] },
      ] },
      OWNER,
    )
    expect(out.blocks).toHaveLength(1)
    const s = out.blocks[0]
    if (s.type === 'stats') expect(s.show).toEqual(['streak', 'gems'])
  })

  it('drops unknown block types entirely (no echo fallback)', () => {
    const out = validateSpotlightLayout({ blocks: [{ type: 'iframe', src: 'evil' }, { type: 'divider' }] }, OWNER)
    expect(out.blocks).toHaveLength(1)
    expect(out.blocks[0].type).toBe('divider')
  })

  it('per-block tint: keeps valid hex (text/bg), drops non-hex, drops an all-invalid tint', () => {
    const out = validateSpotlightLayout(
      { blocks: [
        { type: 'heading', text: 'Tinted', tint: { text: '#ff0000', bg: 'red; drop()' } },
        { type: 'text', text: 'Plain', tint: { text: 'nope', bg: 'also-nope' } },
      ] },
      OWNER,
    )
    expect(out.blocks).toHaveLength(2)
    const h = out.blocks[0]
    if (h.type === 'heading') { expect(h.tint?.text).toBe('#ff0000'); expect(h.tint?.bg).toBeUndefined() }
    const txt = out.blocks[1]
    if (txt.type === 'text') expect(txt.tint).toBeUndefined() // both invalid → no tint attached
  })

  it('accepts the exact path shape the uploader produces (uuid filename, every allowed ext)', () => {
    // Locks the contract between uploadSpotlightImage (`<owner>/spotlight/<uuid>.<ext>`)
    // and the read-side validator: every extension the upload accepts must validate, or a
    // freshly uploaded image would render as nothing.
    const uuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
    for (const ext of ['jpg', 'png', 'gif', 'webp']) {
      const out = validateSpotlightLayout(
        { blocks: [{ type: 'image', assetPath: `${OWNER}/spotlight/${uuid}.${ext}`, alt: 'mine' }] },
        OWNER,
      )
      expect(out.blocks).toHaveLength(1)
      expect(out.blocks[0].type).toBe('image')
    }
    // The same uuid path is also valid as a background.
    expect(validateSpotlightBackground({ assetPath: `${OWNER}/spotlight/${uuid}.gif`, dim: 40 }, OWNER))
      .toEqual({ assetPath: `${OWNER}/spotlight/${uuid}.gif`, dim: 40 })
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
