import { describe, expect, it } from 'vitest'
import { servicesBlocks } from '@/components/page-editor/blocks/services'
import { SERVICES_ACCENTS } from '@/lib/theme/services'
import { SERVICES_KIT_INDEX } from './services-profile-index'
import { SERVICES_TRADE_IDS, SERVICES_TRADES } from './services-trades-data'
import { servicesKit } from './services-variants'
import { loadKit } from './registry'

const TOOLS = ['book', 'sell', 'belong', 'publish', 'gather', 'learn']
// Slot tokens carry the sample numbers; everything outside them is the kit's own words.
const words = (v: unknown) => JSON.stringify(v).replace(/\{\{[^{}]*\}\}/g, '')

describe('Services trade kits', () => {
  it('has the sixteen trades of the design system, General first, and the index says what each kit is', () => {
    expect(SERVICES_TRADE_IDS).toHaveLength(16)
    expect(SERVICES_TRADE_IDS[0]).toBe('general')
    expect(SERVICES_KIT_INDEX.map((k) => k.id)).toEqual(SERVICES_TRADE_IDS.map((t) => `services-${t}`))
    for (const s of SERVICES_KIT_INDEX) {
      const kit = servicesKit(s.id.slice('services-'.length) as (typeof SERVICES_TRADE_IDS)[number])
      expect([kit.id, kit.niche, kit.theme, kit.label, kit.description]).toEqual([s.id, s.niche, s.theme, s.label, s.description])
      expect(kit.pages.map((p) => p.slug)).toEqual(['home', 'services', 'about', 'booking'])
    }
  })
  it('loads every kit through the registry, and General carries the join page', async () => {
    for (const s of SERVICES_KIT_INDEX) expect((await loadKit(s.id))?.id, s.id).toBe(s.id)
    expect((await loadKit('services-general'))!.pages.length).toBeGreaterThan(4)
  })
  it('names the Frequency tools each kit runs and starts it in a shipped accent', () => {
    for (const t of SERVICES_TRADE_IDS) {
      const kit = servicesKit(t)
      expect(kit.tools.length, t).toBeGreaterThanOrEqual(2)
      expect(new Set(kit.tools).size).toBe(kit.tools.length)
      for (const x of kit.tools) expect(TOOLS, t).toContain(x)
      expect(kit.accent, t).toBe(SERVICES_ACCENTS[SERVICES_TRADES[t].accent].accent)
    }
  })
  it('uses only registered Services blocks and keeps every link inside the kit', () => {
    for (const t of SERVICES_TRADE_IDS) {
      const kit = servicesKit(t)
      const slugs = new Set(kit.pages.map((p) => p.slug))
      for (const p of kit.pages) for (const b of p.blocks) expect(Object.keys(servicesBlocks), `${t} ${b.type}`).toContain(b.type)
      for (const [, slug] of JSON.stringify(kit.pages).matchAll(/"~\/([a-z-]+)"/g)) expect(slugs.has(slug), `${t} links to ~/${slug}`).toBe(true)
    }
  })
  it('keeps sample prices in slot tokens, and has no made-up quotes, scores or dashes', () => {
    for (const t of SERVICES_TRADE_IDS) {
      const kit = servicesKit(t)
      expect(words(kit.pages), t).not.toMatch(/\$\s?\d|—|–/)
      expect(words(kit.pages), t).not.toMatch(/\d\.\d from \d+/)
      const reviews = kit.pages.flatMap((p) => p.blocks).filter((b) => b.type === 'ServicesReviews')
      expect(reviews.length).toBeGreaterThan(0)
      for (const b of reviews) for (const r of b.props!.rows as { quote: string }[]) expect(r.quote).toMatch(/^Replace with a real quote/)
    }
  })
  it('puts the three offers and the first people behind slot tokens', () => {
    const text = JSON.stringify(servicesKit('trades').pages)
    for (const key of ['offer1Title', 'offer3Price', 'person1Name']) expect(text).toContain(`{{${key}|`)
  })
})
