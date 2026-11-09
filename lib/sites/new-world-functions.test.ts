import { describe, expect, it } from 'vitest'
import { newWorldBlocks } from '@/components/page-editor/blocks/new-world'
import { NEW_WORLD_EMAIL_TYPES } from '@/lib/theme/new-world-kit-email'
import { NEW_WORLD_KIT_IDS, newWorldKitSpotlightContent } from '@/lib/spotlight/new-world-kit-content'
import { NEW_WORLD_KIT_NICHES, newWorldKit } from '@/lib/sites/kits/new-world-variants'
import { NEW_WORLD_ALWAYS, NEW_WORLD_FUNCTIONS, NEW_WORLD_NEEDS, newWorldSectionFunction } from './new-world-functions'

// LIVE-2193: one function list drives every surface, so the website Home and the Spotlight cannot drift apart.

/** The functions a kit's Spotlight turns on, read back from what it draws. */
function spotlightFunctions(kit: string): string[] {
  const c = newWorldKitSpotlightContent(kit)
  const ids = c.doors.map((d) => d.id).filter((id) => !id.startsWith('offer-'))
  if (c.layouts.includes('calendar-first')) ids.push('booking')
  if (c.layouts.includes('shop-front')) ids.push('services')
  return ids.sort()
}

describe('the New World functions', () => {
  it('names each function once, with a real block, a Space tab and a known email', () => {
    expect(new Set(NEW_WORLD_FUNCTIONS.map((f) => f.id)).size).toBe(NEW_WORLD_FUNCTIONS.length)
    for (const f of NEW_WORLD_FUNCTIONS) {
      expect(f.site.length, f.id).toBeGreaterThan(0)
      for (const type of f.site) expect(newWorldBlocks, `${f.id} draws ${type}`).toHaveProperty(type)
      expect(f.space, f.id).not.toBe('')
      if (f.email) expect(NEW_WORLD_EMAIL_TYPES, f.id).toContain(f.email)
      expect(`${f.label} ${f.door} ${f.why}`, f.id).not.toMatch(/—/)
    }
  })
  it('gives each website section to at most one function', () => {
    const types = NEW_WORLD_FUNCTIONS.flatMap((f) => f.site)
    expect(new Set(types).size).toBe(types.length)
    for (const id of [...NEW_WORLD_ALWAYS, ...Object.keys(NEW_WORLD_NEEDS)]) expect(NEW_WORLD_FUNCTIONS.map((f) => f.id)).toContain(id)
  })
  it('cuts each kit Home to the same functions its Spotlight shows', () => {
    expect([...NEW_WORLD_KIT_IDS].sort()).toEqual([...NEW_WORLD_KIT_NICHES].sort())
    for (const n of NEW_WORLD_KIT_NICHES) {
      const home = newWorldKit(n).pages.find((p) => p.slug === 'home')!.blocks
      const drawn = [...new Set(home.map((b) => newWorldSectionFunction(b.type)).filter((x): x is string => !!x))].sort()
      expect(drawn, n).toEqual(spotlightFunctions(n))
    }
  })
  it('drops the booking and ways-in sections from a kit without the Book tool and numbers the rest with no gaps', () => {
    const kit = newWorldKit('venues')
    expect(kit.tools).not.toContain('book')
    const home = kit.pages.find((p) => p.slug === 'home')!.blocks
    expect(home.map((b) => b.type)).not.toContain('NewWorldOpenings')
    expect(home.map((b) => b.type)).not.toContain('NewWorldOffers')
    expect(home.map((b) => b.type)).toContain('NewWorldShop')
    const index = home.map((b) => b.props?.index).filter((x): x is string => typeof x === 'string' && x !== '')
    expect(index).toEqual(index.map((_, i) => String(i + 1).padStart(2, '0')))
  })
})
