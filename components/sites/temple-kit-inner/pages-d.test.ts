import { describe, expect, it } from 'vitest'
import { templeKitInnerPagesD } from './pages-d'
import { TEMPLE_KIT_INNER_B_CSS } from './inner-b-css'
import { templeKitInnerComponents } from '@/components/page-editor/blocks/temple-kit-inner'
import { templeKitInnerDComponents } from '@/components/page-editor/blocks/temple-kit-inner-d'

const ALL = { ...templeKitInnerComponents, ...templeKitInnerDComponents }

describe('the Temple Kit inner pages, group D', () => {
  it('are Shop and Library, with described pages', () => {
    const pages = templeKitInnerPagesD()
    expect(pages.map((p) => p.slug)).toEqual(['shop', 'library'])
    expect(pages.every((p) => p.seo.description.length > 10)).toBe(true)
  })

  it('uses only blocks that exist, and only props the block declares', () => {
    for (const p of templeKitInnerPagesD()) {
      for (const b of p.blocks) {
        const cfg = ALL[b.type]
        expect(cfg, `${p.slug}/${b.type}`).toBeDefined()
        const fields = Object.keys(cfg.fields ?? {})
        for (const k of Object.keys(b.props ?? {})) expect(fields, `${p.slug}/${b.type}.${k}`).toContain(k)
      }
    }
  })

  it('holds no em dash, no emoji, no seeded rating and no stock number', () => {
    const text = JSON.stringify(templeKitInnerPagesD())
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(text).not.toMatch(/rated|stars|in stock|left in/i)
  })

  it('has its grid in the scoped sheet with no raw colour', () => {
    expect(TEMPLE_KIT_INNER_B_CSS).toContain('[data-house-theme="temple-kit"] .tki-products')
    expect(TEMPLE_KIT_INNER_B_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })
})
