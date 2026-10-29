import { describe, expect, it } from 'vitest'
import { templeKitInnerPagesC } from './pages-c'
import { TEMPLE_KIT_INNER_B_CSS } from './inner-b-css'
import { templeKitInnerComponents } from '@/components/page-editor/blocks/temple-kit-inner'
import { templeKitInnerCComponents } from '@/components/page-editor/blocks/temple-kit-inner-c'

const ALL = { ...templeKitInnerComponents, ...templeKitInnerCComponents }

describe('the Temple Kit inner pages, group C', () => {
  it('is Programs, with a described page', () => {
    const pages = templeKitInnerPagesC()
    expect(pages.map((p) => p.slug)).toEqual(['programs'])
    expect(pages[0].seo.description.length).toBeGreaterThan(10)
  })

  it('uses only blocks that exist, and only props the block declares', () => {
    for (const p of templeKitInnerPagesC()) {
      for (const b of p.blocks) {
        const cfg = ALL[b.type]
        expect(cfg, `${p.slug}/${b.type}`).toBeDefined()
        const fields = Object.keys(cfg.fields ?? {})
        for (const k of Object.keys(b.props ?? {})) expect(fields, `${p.slug}/${b.type}.${k}`).toContain(k)
      }
    }
  })

  it('holds no em dash, no emoji, and no seeded rating, enrolment or run date', () => {
    const text = JSON.stringify(templeKitInnerPagesC())
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(text).not.toMatch(/\d+ (have|people|members)|rated|stars|next run/i)
  })

  it('has its grid in the scoped sheet with no raw colour', () => {
    expect(TEMPLE_KIT_INNER_B_CSS).toContain('[data-house-theme="temple-kit"] .tki-cards--three')
    expect(TEMPLE_KIT_INNER_B_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })
})
