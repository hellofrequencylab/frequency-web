import { describe, expect, it } from 'vitest'
import { templeKitInnerPagesA } from './pages'
import { templeKitInnerComponents } from '@/components/page-editor/blocks/temple-kit-inner'

describe('the Temple Kit inner pages, group A', () => {
  it('are Ceremonies and hire, About and Contact, in menu order, with unique slugs', () => {
    const pages = templeKitInnerPagesA()
    expect(pages.map((p) => p.slug)).toEqual(['ceremonies-hire', 'about', 'contact'])
    expect(new Set(pages.map((p) => p.slug)).size).toBe(pages.length)
    for (const p of pages) expect(p.seo.description.length).toBeGreaterThan(10)
  })

  it('use only blocks that exist, and only props the block declares', () => {
    for (const p of templeKitInnerPagesA()) {
      for (const b of p.blocks) {
        if (!b.type.startsWith('TempleKitInner')) continue
        const cfg = templeKitInnerComponents[b.type]
        expect(cfg, `${p.slug}/${b.type}`).toBeDefined()
        const fields = Object.keys(cfg.fields ?? {})
        for (const k of Object.keys(b.props ?? {})) expect(fields, `${p.slug}/${b.type}.${k}`).toContain(k)
      }
    }
  })

  it('hold no em dash and no emoji in the words', () => {
    const text = JSON.stringify(templeKitInnerPagesA())
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
