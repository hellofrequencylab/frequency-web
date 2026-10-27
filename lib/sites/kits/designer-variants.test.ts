import { describe, expect, it } from 'vitest'
import { designerComponents } from '@/components/page-editor/blocks/designer'
import { KIT_INDEX, loadKit } from './registry'

const NICHES = ['coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks']

describe('Designer niche kits', () => {
  it('has one kit per niche, in the index and loadable', async () => {
    const indexed = KIT_INDEX.filter((k) => k.theme === 'Designer')
    expect(indexed.map((k) => k.niche)).toEqual(NICHES)
    for (const s of indexed) {
      const kit = await loadKit(s.id)
      expect(kit?.theme, s.id).toBe('Designer')
      expect(kit?.pages[0].slug).toBe('home')
    }
  })
  it('uses registered Designer blocks or shared Space blocks, no prices or dashes', async () => {
    for (const s of KIT_INDEX.filter((k) => k.theme === 'Designer')) {
      const kit = (await loadKit(s.id))!
      const text = JSON.stringify(kit.pages)
      expect(text, s.id).not.toMatch(/\$\d|—/)
      for (const p of kit.pages) {
        for (const b of p.blocks) {
          if (b.type.startsWith('Designer')) expect(Object.keys(designerComponents), `${s.id} ${b.type}`).toContain(b.type)
        }
      }
    }
  })
  it('keeps every link inside the kit', async () => {
    for (const s of KIT_INDEX.filter((k) => k.theme === 'Designer')) {
      const kit = (await loadKit(s.id))!
      const slugs = new Set(kit.pages.map((p) => p.slug))
      const links = [...JSON.stringify(kit.pages).matchAll(/"~\/([a-z-]+)"/g)].map((x) => x[1])
      for (const l of links) expect(['book', 'offerings', 'contact', 'membership', ...slugs], `${s.id} ~/${l}`).toContain(l)
    }
  })
})
