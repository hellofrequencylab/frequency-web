import { describe, expect, it } from 'vitest'
import { servicesBlocks } from '@/components/page-editor/blocks/services'
import { SERVICES_ACCENTS } from '@/lib/theme/services'
import { SERVICES_KIT_INDEX } from './services-profile-index'
import { SERVICES_KIT_NICHES, servicesKit } from './services-variants'

const TOOLS = ['book', 'sell', 'belong', 'publish', 'gather', 'learn']
// Slot tokens carry the sample numbers; everything outside them is the kit's own words.
const words = (v: unknown) => JSON.stringify(v).replace(/\{\{[^{}]*\}\}/g, '')

describe('Services starter kits', () => {
  it('has one kit per niche and the index says what each kit is', () => {
    expect(SERVICES_KIT_INDEX.map((k) => k.niche)).toEqual([...SERVICES_KIT_NICHES])
    for (const s of SERVICES_KIT_INDEX) {
      const kit = servicesKit(s.niche)
      expect([kit.id, kit.niche, kit.theme, kit.label, kit.description]).toEqual([s.id, s.niche, s.theme, s.label, s.description])
      expect(kit.pages.map((p) => p.slug)).toEqual(['home', 'services', 'about', 'book'])
    }
  })
  it('names the Frequency tools each kit runs, from the design', () => {
    for (const n of SERVICES_KIT_NICHES) {
      const { tools } = servicesKit(n)
      expect(tools.length, n).toBeGreaterThanOrEqual(4)
      expect(new Set(tools).size).toBe(tools.length)
      for (const t of tools) expect(TOOLS, n).toContain(t)
    }
  })
  it('uses only registered Services blocks and keeps every link inside the kit', () => {
    for (const n of SERVICES_KIT_NICHES) {
      const kit = servicesKit(n)
      const slugs = new Set(kit.pages.map((p) => p.slug))
      for (const p of kit.pages) for (const b of p.blocks) expect(Object.keys(servicesBlocks), `${n} ${b.type}`).toContain(b.type)
      for (const [, slug] of JSON.stringify(kit.pages).matchAll(/"~\/([a-z-]+)"/g)) expect(slugs.has(slug), `${n} links to ~/${slug}`).toBe(true)
    }
  })
  it('keeps sample numbers and prices in slot tokens, and has no made-up quotes or dashes', () => {
    for (const n of SERVICES_KIT_NICHES) {
      const kit = servicesKit(n)
      expect(words(kit.pages), n).not.toMatch(/\$\s?\d|—/)
      const reviews = kit.pages.flatMap((p) => p.blocks).filter((b) => b.type === 'ServicesReviews')
      expect(reviews.length).toBeGreaterThan(0)
      for (const b of reviews) for (const r of b.props!.rows as { quote: string }[]) expect(r.quote).toMatch(/^Replace with a real quote/)
    }
  })
  it('puts the first three offers, people and events behind slot tokens', () => {
    const text = JSON.stringify(servicesKit('coaches').pages)
    for (const key of ['offer1Title', 'offer3Price', 'person1Name', 'event1Title']) expect(text).toContain(`{{${key}|`)
  })
  it('starts a blue kit in Tide and leaves the accent unset when its preset has not shipped', () => {
    expect(servicesKit('hosts').accent).toBe('tide')
    expect(Object.keys(SERVICES_ACCENTS)).toContain('tide')
    expect(servicesKit('coaches').accent).toBeUndefined()
  })
})
