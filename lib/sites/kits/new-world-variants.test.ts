import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { servicesBlocks } from '@/components/page-editor/blocks/services'
import { newWorldBlocks } from '@/components/page-editor/blocks/new-world'
import { NEW_WORLD_ACCENTS } from '@/lib/theme/new-world'
import { NEW_WORLD_KIT_INDEX } from './new-world-profile-index'
import { NEW_WORLD_KIT_NICHES, newWorldKit } from './new-world-variants'

const TOOLS = ['book', 'sell', 'belong', 'publish', 'gather', 'learn']
// Slot tokens carry the sample numbers; everything outside them is the kit's own words.
const words = (v: unknown) => JSON.stringify(v).replace(/\{\{[^{}]*\}\}/g, '')

describe('New World starter kits', () => {
  it('has one kit per niche and the index says what each kit is', () => {
    expect(NEW_WORLD_KIT_INDEX.map((k) => k.niche)).toEqual([...NEW_WORLD_KIT_NICHES])
    for (const s of NEW_WORLD_KIT_INDEX) {
      const kit = newWorldKit(s.niche)
      expect([kit.id, kit.niche, kit.theme, kit.label, kit.description]).toEqual([s.id, s.niche, s.theme, s.label, s.description])
      expect(kit.pages.map((p) => p.slug)).toEqual(['home', 'services', 'about', 'booking'])
    }
  })
  it('names the Frequency tools each kit runs, from the design', () => {
    for (const n of NEW_WORLD_KIT_NICHES) {
      const { tools } = newWorldKit(n)
      expect(tools.length, n).toBeGreaterThanOrEqual(4)
      expect(new Set(tools).size).toBe(tools.length)
      for (const t of tools) expect(TOOLS, n).toContain(t)
    }
  })
  it('uses only registered New World and Services-family blocks and keeps every link inside the kit', () => {
    const known = [...Object.keys(newWorldBlocks), ...Object.keys(servicesBlocks)]
    for (const n of NEW_WORLD_KIT_NICHES) {
      const kit = newWorldKit(n)
      const slugs = new Set(kit.pages.map((p) => p.slug))
      for (const p of kit.pages) for (const b of p.blocks) expect(known, `${n} ${b.type}`).toContain(b.type)
      for (const [, slug] of JSON.stringify(kit.pages).matchAll(/"~\/([a-z-]+)"/g)) expect(slugs.has(slug), `${n} links to ~/${slug}`).toBe(true)
    }
  })
  it('keeps sample numbers and prices in slot tokens, and has no made-up quotes or dashes', () => {
    for (const n of NEW_WORLD_KIT_NICHES) {
      const kit = newWorldKit(n)
      expect(words(kit.pages), n).not.toMatch(/\$\s?\d|—/)
      const reviews = kit.pages.flatMap((p) => p.blocks).filter((b) => /^(Services|NewWorld)Reviews$/.test(b.type))
      expect(reviews.length).toBeGreaterThan(0)
      for (const b of reviews) for (const r of b.props!.rows as { quote: string }[]) expect(r.quote).toMatch(/^Replace with a real quote/)
    }
  })
  it('puts the first three offers, people and events behind slot tokens', () => {
    const text = JSON.stringify(newWorldKit('coaches').pages)
    for (const key of ['offer1Title', 'offer3Price', 'person1Name', 'event1Title']) expect(text).toContain(`{{${key}|`)
  })
  it('draws Home with New World blocks in the design order and every photo it names exists', () => {
    for (const n of NEW_WORLD_KIT_NICHES) {
      const home = newWorldKit(n).pages[0]!
      expect(home.blocks.every((b) => b.type.startsWith('NewWorld')), n).toBe(true)
      expect(home.blocks[0]!.type).toBe('NewWorldHero')
      expect(home.blocks.at(-1)!.type).toBe('NewWorldCloser')
      for (const [, file] of JSON.stringify(home.blocks).matchAll(/"\/sites\/new-world\/photos\/([a-z-]+)\.webp"/g)) expect(existsSync(`public/sites/new-world/photos/${file}.webp`), file).toBe(true)
    }
  })
  it('starts a blue kit in Tide and leaves the accent unset when its preset has not shipped', () => {
    expect(newWorldKit('hosts').accent).toBe(NEW_WORLD_ACCENTS.tide.accent)
    expect(Object.keys(NEW_WORLD_ACCENTS)).toContain('tide')
    expect(newWorldKit('coaches').accent).toBeUndefined()
  })
})
