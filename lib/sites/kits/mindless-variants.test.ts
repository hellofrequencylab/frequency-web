import { describe, expect, it } from 'vitest'
import { servicesBlocks } from '@/components/page-editor/blocks/services'
import { MINDLESS_ACCENTS } from '@/lib/theme/mindless'
import { MINDLESS_KIT_INDEX } from './mindless-profile-index'
import { MINDLESS_KIT_IDS, MINDLESS_KIT_NICHE, mindlessKit } from './mindless-variants'
import { loadKit } from './registry'

const TOOLS = ['book', 'sell', 'belong', 'publish', 'gather', 'learn']
// Slot tokens carry the sample numbers; everything outside them is the kit's own words.
const words = (v: unknown) => JSON.stringify(v).replace(/\{\{[^{}]*\}\}/g, '')

describe('Mindless starter kits', () => {
  it('has the design\'s six kits and the index says what each kit is', () => {
    expect(MINDLESS_KIT_INDEX.map((k) => k.kit)).toEqual([...MINDLESS_KIT_IDS])
    for (const s of MINDLESS_KIT_INDEX) {
      const kit = mindlessKit(s.kit)
      expect([kit.id, kit.niche, kit.theme, kit.label, kit.description]).toEqual([s.id, s.niche, s.theme, s.label, s.description])
      expect(MINDLESS_KIT_NICHE[s.kit]).toBe(s.niche)
      expect(kit.pages.map((p) => p.slug)).toEqual(['home', 'services', 'about', 'booking'])
    }
  })
  it('loads every kit through the registry, and General is the one a new Space publishes', async () => {
    for (const s of MINDLESS_KIT_INDEX) expect((await loadKit(s.id))?.id, s.id).toBe(s.id)
    expect((await loadKit('mindless-general'))?.pages.map((p) => p.slug)).toContain('join')
  })
  it('names the Frequency tools each kit runs, from the design', () => {
    for (const n of MINDLESS_KIT_IDS) {
      const { tools } = mindlessKit(n)
      expect(tools.length, n).toBeGreaterThanOrEqual(3)
      expect(new Set(tools).size).toBe(tools.length)
      for (const t of tools) expect(TOOLS, n).toContain(t)
    }
  })
  it('starts each kit in one of the three paints, General in Yellow', () => {
    const hexes = Object.values(MINDLESS_ACCENTS).map((a) => a.accent)
    for (const n of MINDLESS_KIT_IDS) expect(hexes, n).toContain(mindlessKit(n).accent)
    expect(mindlessKit('general').accent).toBe(MINDLESS_ACCENTS.yellow.accent)
    expect(mindlessKit('circle').accent).toBe(MINDLESS_ACCENTS.pink.accent)
    expect(mindlessKit('guide').accent).toBe(MINDLESS_ACCENTS.blue.accent)
  })
  it('is never literal about venues', () => {
    for (const n of MINDLESS_KIT_IDS) expect(words(mindlessKit(n).pages), n).not.toMatch(/laundromat|laundry|bar sit|rooftop sit|your brain is loud/i)
  })
  it('uses only registered Services-family blocks and keeps every link inside the kit', () => {
    for (const n of MINDLESS_KIT_IDS) {
      const kit = mindlessKit(n)
      const slugs = new Set(kit.pages.map((p) => p.slug))
      for (const p of kit.pages) for (const b of p.blocks) expect(Object.keys(servicesBlocks), `${n} ${b.type}`).toContain(b.type)
      for (const [, slug] of JSON.stringify(kit.pages).matchAll(/"~\/([a-z-]+)"/g)) expect(slugs.has(slug), `${n} links to ~/${slug}`).toBe(true)
    }
  })
  it('keeps prices in slot tokens, has no dashes or curly quotes, and no made-up quotes', () => {
    for (const n of MINDLESS_KIT_IDS) {
      const kit = mindlessKit(n)
      expect(words(kit.pages), n).not.toMatch(/\$\s?\d|\$—|—|’|“|”/)
      const reviews = kit.pages.flatMap((p) => p.blocks).filter((b) => b.type === 'ServicesReviews')
      expect(reviews.length).toBeGreaterThan(0)
      for (const b of reviews) for (const r of b.props!.rows as { quote: string }[]) expect(r.quote).toMatch(/^Replace with a real quote/)
    }
  })
  it('puts the first three offers, people and events behind slot tokens', () => {
    const text = JSON.stringify(mindlessKit('general').pages)
    for (const key of ['offer1Title', 'offer3Price', 'person1Name', 'event1Title']) expect(text).toContain(`{{${key}|`)
  })
})
