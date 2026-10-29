import { describe, expect, it } from 'vitest'
import { templeKitInnerPagesB } from './pages-b'
import { TEMPLE_KIT_INNER_B_CSS } from './inner-b-css'
import { templeKitInnerComponents } from '@/components/page-editor/blocks/temple-kit-inner'
import { templeKitInnerBComponents } from '@/components/page-editor/blocks/temple-kit-inner-b'

const ALL = { ...templeKitInnerComponents, ...templeKitInnerBComponents }

describe('the Temple Kit inner pages, group B', () => {
  it('are Gatherings and Membership, with unique slugs', () => {
    const pages = templeKitInnerPagesB()
    expect(pages.map((p) => p.slug)).toEqual(['gatherings', 'membership'])
    for (const p of pages) expect(p.seo.description.length).toBeGreaterThan(10)
  })

  it('use only blocks that exist, and only props the block declares', () => {
    for (const p of templeKitInnerPagesB()) {
      for (const b of p.blocks) {
        const cfg = ALL[b.type]
        expect(cfg, `${p.slug}/${b.type}`).toBeDefined()
        const fields = Object.keys(cfg.fields ?? {})
        for (const k of Object.keys(b.props ?? {})) expect(fields, `${p.slug}/${b.type}.${k}`).toContain(k)
      }
    }
  })

  it('hold no em dash and no emoji, and seed no member or seat counts', () => {
    const text = JSON.stringify(templeKitInnerPagesB())
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(text).not.toMatch(/\d+ members|seats left|of \d+ open/i)
  })

  it('has a sheet scoped to the site render with no raw colour', () => {
    expect(TEMPLE_KIT_INNER_B_CSS).toContain('[data-house-theme="temple-kit"] .tki-tier')
    expect(TEMPLE_KIT_INNER_B_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })
})
