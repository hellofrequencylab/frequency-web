import { describe, expect, it } from 'vitest'
import { servicesBlocks } from '@/components/page-editor/blocks/services'
import { CYBERWITCH_ACCENTS } from '@/lib/theme/cyberwitch'
import { CYBERWITCH_KIT_INDEX } from './cyberwitch-profile-index'
import { CYBERWITCH_KIT_IDS, CYBERWITCH_KIT_NICHE, cyberwitchKit } from './cyberwitch-variants'
import { loadKit } from './registry'

const TOOLS = ['book', 'sell', 'belong', 'publish', 'gather', 'learn']
// Slot tokens carry the sample numbers; everything outside them is the kit's own words.
const words = (v: unknown) => JSON.stringify(v).replace(/\{\{[^{}]*\}\}/g, '')

describe('CyberWitch starter kits', () => {
  it('has the design\'s six kits and the index says what each kit is', () => {
    expect(CYBERWITCH_KIT_INDEX.map((k) => k.kit)).toEqual([...CYBERWITCH_KIT_IDS])
    for (const s of CYBERWITCH_KIT_INDEX) {
      const kit = cyberwitchKit(s.kit)
      expect([kit.id, kit.niche, kit.theme, kit.label, kit.description]).toEqual([s.id, s.niche, s.theme, s.label, s.description])
      expect(CYBERWITCH_KIT_NICHE[s.kit]).toBe(s.niche)
      expect(kit.pages.map((p) => p.slug)).toEqual(['home', 'services', 'about', 'booking'])
    }
  })
  it('loads every kit through the registry, and General is the one a new Space publishes', async () => {
    for (const s of CYBERWITCH_KIT_INDEX) expect((await loadKit(s.id))?.id, s.id).toBe(s.id)
    expect((await loadKit('cyberwitch-general'))?.pages.map((p) => p.slug)).toContain('join')
  })
  it('names the Frequency tools each kit runs, from the design', () => {
    for (const n of CYBERWITCH_KIT_IDS) {
      const { tools } = cyberwitchKit(n)
      expect(tools.length, n).toBeGreaterThanOrEqual(3)
      expect(new Set(tools).size).toBe(tools.length)
      for (const t of tools) expect(TOOLS, n).toContain(t)
    }
  })
  it('starts each kit in one of the five accents, and never in Volt (a violet)', () => {
    const hexes = Object.values(CYBERWITCH_ACCENTS).map((a) => a.accent)
    for (const n of CYBERWITCH_KIT_IDS) expect(hexes, n).toContain(cyberwitchKit(n).accent)
    expect(cyberwitchKit('general').accent).toBe(CYBERWITCH_ACCENTS.hex.accent)
    expect(cyberwitchKit('practitioner').accent).toBe(CYBERWITCH_ACCENTS.ice.accent)
    expect(cyberwitchKit('reader').accent).toBe(CYBERWITCH_ACCENTS.absinthe.accent)
    expect(cyberwitchKit('band').accent).toBe(CYBERWITCH_ACCENTS.blood.accent)
  })
  it('uses only registered Services-family blocks and keeps every link inside the kit', () => {
    for (const n of CYBERWITCH_KIT_IDS) {
      const kit = cyberwitchKit(n)
      const slugs = new Set(kit.pages.map((p) => p.slug))
      for (const p of kit.pages) for (const b of p.blocks) expect(Object.keys(servicesBlocks), `${n} ${b.type}`).toContain(b.type)
      for (const [, slug] of JSON.stringify(kit.pages).matchAll(/"~\/([a-z-]+)"/g)) expect(slugs.has(slug), `${n} links to ~/${slug}`).toBe(true)
    }
  })
  it('keeps prices in slot tokens, has no dashes or curly quotes, and no made-up quotes', () => {
    for (const n of CYBERWITCH_KIT_IDS) {
      const kit = cyberwitchKit(n)
      expect(words(kit.pages), n).not.toMatch(/\$\s?\d|\$—|—|’|“|”/)
      const reviews = kit.pages.flatMap((p) => p.blocks).filter((b) => b.type === 'ServicesReviews')
      expect(reviews.length).toBeGreaterThan(0)
      for (const b of reviews) for (const r of b.props!.rows as { quote: string }[]) expect(r.quote).toMatch(/^Replace with a real quote/)
    }
  })
  it('puts the first three offers, people and events behind slot tokens', () => {
    const text = JSON.stringify(cyberwitchKit('general').pages)
    for (const key of ['offer1Title', 'offer3Price', 'person1Name', 'event1Title']) expect(text).toContain(`{{${key}|`)
  })
})
