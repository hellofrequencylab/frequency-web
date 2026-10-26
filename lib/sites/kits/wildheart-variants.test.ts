import { describe, expect, it } from 'vitest'
import { validWebsiteSnapshot } from '@/lib/sites/editor/state'
import { applyKit } from './apply'
import { KIT_INDEX, loadKit } from './registry'

const NICHES = ['coaches', 'hosts', 'networks', 'nonprofits', 'studios', 'venues']

describe('Wildheart niche variants', () => {
  const ids = KIT_INDEX.filter((k) => k.theme === 'Wildheart')
  it('there is one for each niche door', () => {
    expect(ids.map((k) => k.niche).sort()).toEqual(NICHES)
  })
  it('every block is registered and the applied site is valid', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of ids) {
      const kit = (await loadKit(s.id))!
      for (const p of kit.pages) for (const b of p.blocks) expect(config.components[b.type], `${s.id}/${p.slug}: ${b.type}`).toBeTruthy()
      const r = applyKit({ theme: 'Wildheart', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      expect(r.ok && validWebsiteSnapshot(r.snapshot), s.id).toBe(true)
    }
  })
  it('holds no prices, photos, dashes or real names', async () => {
    for (const s of ids) expect(JSON.stringify(await loadKit(s.id)), s.id).not.toMatch(/\$\d|\.jpg|\.png|\.webp|—|Royal Temple|Vista/)
  })
  it('every link stays inside the kit or a platform page', async () => {
    for (const s of ids) {
      const kit = (await loadKit(s.id))!
      const own = new Set([...kit.pages.map((p) => p.slug), 'book', 'contact'])
      const links = [...JSON.stringify(kit).matchAll(/~\/([a-z-]+)/g)].map((m) => m[1])
      expect(links.filter((l) => !own.has(l)), s.id).toEqual([])
    }
  })
})
