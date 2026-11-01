import { describe, it, expect } from 'vitest'
import { linktreeComponents, LINKTREE_CATEGORY_COMPONENTS } from './linktree'
import { SPOTLIGHT_PUCK_TYPES } from '@/lib/spotlight/puck/convert'
import { MAX_LINKS_PER_BLOCK, MAX_GALLERY_IMAGES, SPOTLIGHT_STAT_KEYS } from '@/lib/spotlight/blocks/schema'

// The link-tree block registry contract: every Spotlight block is registered, each has the
// field schema + defaultProps the converter + editor rely on, and the privacy-shaped blocks
// (Stats, TopFriends) carry NO server-resolved value in their stored contract.

describe('the registry covers every Spotlight block', () => {
  it('registers exactly the ten link-tree blocks', () => {
    expect(Object.keys(linktreeComponents).sort()).toEqual([...LINKTREE_CATEGORY_COMPONENTS].sort())
    expect(Object.keys(linktreeComponents)).toHaveLength(10)
  })

  it('the category list matches the mapped Puck types', () => {
    expect(new Set(LINKTREE_CATEGORY_COMPONENTS)).toEqual(new Set(Object.values(SPOTLIGHT_PUCK_TYPES)))
  })

  it('every block has fields, defaultProps, and a render function', () => {
    for (const [key, cfg] of Object.entries(linktreeComponents)) {
      expect(cfg.fields, `${key}.fields`).toBeTruthy()
      expect(cfg.defaultProps, `${key}.defaultProps`).toBeTruthy()
      expect(typeof cfg.render, `${key}.render`).toBe('function')
    }
  })
})

describe('the LinkTree (links) block', () => {
  it('exposes an array field for the link items', () => {
    const f = linktreeComponents.LinkTree.fields!.items as unknown as { type: string; arrayFields: Record<string, unknown> }
    expect(f.type).toBe('array')
    expect(Object.keys(f.arrayFields)).toEqual(['label', 'url'])
  })

  it('labels the field with the MAX_LINKS_PER_BLOCK cap', () => {
    const f = linktreeComponents.LinkTree.fields!.items as unknown as { label?: string }
    expect(f.label).toContain(String(MAX_LINKS_PER_BLOCK))
  })
})

describe('the SpotlightGallery block', () => {
  it('exposes an array field for images with crop framing', () => {
    const f = linktreeComponents.SpotlightGallery.fields!.items as unknown as { type: string; arrayFields: Record<string, unknown>; label?: string }
    expect(f.type).toBe('array')
    expect(Object.keys(f.arrayFields)).toEqual(['assetPath', 'alt', 'focusX', 'focusY', 'zoom'])
    expect(f.label).toContain(String(MAX_GALLERY_IMAGES))
  })
})

describe('privacy: server-resolved blocks carry NO values', () => {
  it('SpotlightStats stores only WHICH stats to show, never a number', () => {
    const fields = Object.keys(linktreeComponents.SpotlightStats.fields!)
    expect(fields).toEqual(['show'])
    // Its options are exactly the allowlisted stat keys (no free-form value input).
    const show = linktreeComponents.SpotlightStats.fields!.show as unknown as { arrayFields: { key: { options: { value: string }[] } } }
    expect(show.arrayFields.key.options.map((o) => o.value).sort()).toEqual([...SPOTLIGHT_STAT_KEYS].sort())
  })

  it('TopFriends stores only an optional title, never friend identities', () => {
    expect(Object.keys(linktreeComponents.TopFriends.fields!)).toEqual(['title'])
    expect(linktreeComponents.TopFriends.defaultProps).toEqual({ title: '' })
  })

  it('SpotlightEmbed stores a validated (provider, ref), never a raw iframe src', () => {
    const fields = Object.keys(linktreeComponents.SpotlightEmbed.fields!)
    expect(fields).toEqual(['provider', 'ref'])
    expect(fields).not.toContain('src')
  })
})

describe('image blocks store an owner-bucket PATH, never a full URL field', () => {
  it('SpotlightImage stores assetPath + framing', () => {
    expect(Object.keys(linktreeComponents.SpotlightImage.fields!)).toEqual(['assetPath', 'alt', 'focusX', 'focusY', 'zoom'])
  })
})
