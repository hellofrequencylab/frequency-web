import { describe, expect, it } from 'vitest'
import { networkKitInnerPagesB } from './pages-b'
import { networkKitComponents } from '@/components/page-editor/blocks/network-kit'
import { networkKitMoreComponents } from '@/components/page-editor/blocks/network-kit-more'
import { networkKitInnerComponents, NETWORK_KIT_INNER_ROLES } from '@/components/page-editor/blocks/network-kit-inner'

const ALL = { ...networkKitComponents, ...networkKitMoreComponents, ...networkKitInnerComponents }

describe('the Network Kit inner pages, pass B', () => {
  it('are Book, Shop and the Library, with unique slugs the menu links to', () => {
    const pages = networkKitInnerPagesB()
    expect(pages.map((p) => p.slug)).toEqual(['book', 'shop', 'resources'])
    for (const p of pages) expect(p.seo.description.length).toBeGreaterThan(10)
  })

  it('open on the shared page header and use only blocks that exist, and only props the block declares', () => {
    for (const p of networkKitInnerPagesB()) {
      expect(p.blocks[0].type, p.slug).toBe('NetworkKitHero')
      for (const b of p.blocks) {
        const cfg = ALL[b.type]
        expect(cfg, `${p.slug}/${b.type}`).toBeDefined()
        const fields = Object.keys(cfg.fields ?? {})
        for (const k of Object.keys(b.props ?? {})) expect(fields, `${p.slug}/${b.type}.${k}`).toContain(k)
      }
    }
  })

  it('extend the shared shop, library and offerings blocks instead of adding second ones', () => {
    const types = networkKitInnerPagesB().flatMap((p) => p.blocks.map((b) => `${p.slug}:${b.type}:${(b.props as { variant?: string }).variant ?? ''}`))
    expect(types).toContain('shop:NetworkKitShop:catalog')
    expect(types).toContain('resources:NetworkKitLibrary:table')
    expect(types).toContain('book:NetworkKitOfferings:cards')
    expect(Object.keys(NETWORK_KIT_INNER_ROLES).sort()).toEqual(Object.keys(networkKitInnerComponents).sort())
    for (const forbidden of ['Shop', 'Library', 'Offerings', 'Proof', 'FAQ', 'CTA', 'Letter', 'Stats']) expect(Object.keys(networkKitInnerComponents).some((k) => k.endsWith(forbidden))).toBe(false)
  })

  it('holds the voice guide: no em dash, emoji, cohort, Midnight, weekly promise, free promise, price or seeded count', () => {
    const text = JSON.stringify(networkKitInnerPagesB())
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(text).not.toMatch(/cohort|midnight/i)
    expect(text).not.toMatch(/\b(weekly|every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i)
    expect(text).not.toMatch(/\bfree\b/i)
    expect(text).not.toMatch(/\d+ members|seats left|of \d+ open|\$\d|reviews|shipping/i)
  })

  it('leave payment to the platform: no pay button, card field or checkout in a page', () => {
    expect(JSON.stringify(networkKitInnerPagesB())).not.toMatch(/checkout|pay now|add to bag|card number/i)
  })
})
