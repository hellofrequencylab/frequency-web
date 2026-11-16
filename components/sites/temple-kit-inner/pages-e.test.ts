import { describe, expect, it } from 'vitest'
import { templeKitBookPage, templeKitInnerPagesE } from './pages-e'
import { templeKitInnerComponents } from '@/components/page-editor/blocks/temple-kit-inner'

const SHARED = new Set(['SpaceBooking'])

describe('the Temple Kit inner pages, group E', () => {
  it('is Book, with a described page that leads with the hero', () => {
    const pages = templeKitInnerPagesE()
    expect(pages.map((p) => p.slug)).toEqual(['book'])
    expect(pages[0].seo.description.length).toBeGreaterThan(10)
    expect(pages[0].blocks[0].type).toBe('TempleKitInnerHero')
  })

  it('uses only blocks that exist, and only props the Temple blocks declare', () => {
    for (const b of templeKitBookPage().blocks) {
      if (SHARED.has(b.type)) continue
      const cfg = templeKitInnerComponents[b.type]
      expect(cfg, b.type).toBeDefined()
      const fields = Object.keys(cfg.fields ?? {})
      for (const k of Object.keys(b.props ?? {})) expect(fields, `${b.type}.${k}`).toContain(k)
    }
  })

  it('puts the shared booking block on the page and seeds no price, em dash or emoji', () => {
    const page = templeKitBookPage()
    expect(page.blocks.some((b) => b.type === 'SpaceBooking')).toBe(true)
    const text = JSON.stringify(page)
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(text).not.toMatch(/\$\d/)
  })
})
