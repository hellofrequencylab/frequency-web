import { describe, expect, it } from 'vitest'
import { networkKitInnerPagesA } from './pages'
import { networkKitComponents } from '@/components/page-editor/blocks/network-kit'
import { networkKitMoreComponents } from '@/components/page-editor/blocks/network-kit-more'
import { networkKitInnerComponents, NETWORK_KIT_INNER_ROLES } from '@/components/page-editor/blocks/network-kit-inner'

const ALL = { ...networkKitComponents, ...networkKitMoreComponents, ...networkKitInnerComponents }

describe('the Network Kit inner pages, pass A', () => {
  it('are About, Services, Meetups and Programs, with unique slugs the menu links to', () => {
    const pages = networkKitInnerPagesA()
    expect(pages.map((p) => p.slug).sort()).toEqual(['about', 'journeys', 'services', 'workshops'])
    for (const p of pages) expect(p.seo.description.length).toBeGreaterThan(10)
  })

  it('open on the shared page header and use only blocks that exist, and only props the block declares', () => {
    for (const p of networkKitInnerPagesA()) {
      expect(p.blocks[0].type, p.slug).toBe('NetworkKitHero')
      for (const b of p.blocks) {
        const cfg = ALL[b.type]
        expect(cfg, `${p.slug}/${b.type}`).toBeDefined()
        const fields = Object.keys(cfg.fields ?? {})
        for (const k of Object.keys(b.props ?? {})) expect(fields, `${p.slug}/${b.type}.${k}`).toContain(k)
      }
    }
  })

  it('adds no second block for a role the kit already has: every inner block names its role and layout', () => {
    expect(Object.keys(NETWORK_KIT_INNER_ROLES).sort()).toEqual(Object.keys(networkKitInnerComponents).sort())
    for (const k of Object.keys(networkKitInnerComponents)) expect(k).toMatch(/^NetworkKitInner[A-Z]/)
    for (const forbidden of ['Proof', 'FAQ', 'CTA', 'Letter', 'Stats']) expect(Object.keys(networkKitInnerComponents).some((k) => k.endsWith(forbidden))).toBe(false)
  })

  it('holds the voice guide: no em dash, emoji, cohort, Midnight, weekly promise, free promise or seeded count', () => {
    const text = JSON.stringify(networkKitInnerPagesA())
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(text).not.toMatch(/cohort|midnight/i)
    expect(text).not.toMatch(/\b(weekly|every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))\b/i)
    expect(text).not.toMatch(/\bfree\b/i)
    expect(text).not.toMatch(/\d+ members|seats left|of \d+ open|\$\d/i)
  })
})
