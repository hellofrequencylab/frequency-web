import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { join } from 'node:path'
import { BlockRender } from '@/lib/page-editor/block-render'
import type { Data } from '@/lib/page-editor/types'
import { designerComponents } from '@/components/page-editor/blocks/designer'
import { validWebsiteSnapshot } from '@/lib/sites/editor/state'
import kitData from '@/lib/themes/designer-kits.json'
import { applyKit } from './apply'
import { DESIGNER_PROFILES, SOFTEN, designerProfileAccent } from './designer-profile-variants'
import { DESIGNER_PROFILE_KIT_INDEX, KIT_INDEX, loadKit } from './registry'

const PROFILES = ['general', 'coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks', 'creators', 'schools', 'clubs', 'faith', 'wellness', 'markets']

describe('Designer profile kits', () => {
  it('there is one for each of the design system profiles, with its names', async () => {
    expect(DESIGNER_PROFILE_KIT_INDEX.map((k) => k.niche)).toEqual(PROFILES)
    expect(DESIGNER_PROFILES).toEqual(PROFILES)
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const kit = await loadKit(s.id)
      expect(kit?.id).toBe(`designer-profile-${s.niche}`)
      expect([kit?.theme, kit?.niche, kit?.label, kit?.description]).toEqual(['Designer', s.niche, s.label, s.description])
      expect(kit?.pages[0].slug).toBe('home')
    }
  })

  it('leaves the six niche doors as they were', () => {
    expect(KIT_INDEX.filter((k) => k.theme === 'Designer').map((k) => k.id)).toEqual(['coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks'].map((n) => `designer-${n}`))
    expect(KIT_INDEX.some((k) => k.id.startsWith('designer-profile-'))).toBe(false)
  })

  it('lays the home out in the design order, with the hero strip, photography and the closing call', async () => {
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const home = (await loadKit(s.id))!.pages[0]
      const types = home.blocks.map((b) => b.type)
      expect(types[0], s.id).toBe('DesignerHero')
      expect(types.at(-1), s.id).toBe('DesignerClosing')
      expect(types, s.id).toContain('DesignerSteps')
      const hero = home.blocks[0].props as { image: string; alt: string; strip: unknown[] }
      expect(hero.image, s.id).toMatch(/^\/sites\/designer\/photos\/dz-[a-z0-9-]+\.webp$/)
      expect(hero.alt, s.id).not.toBe('')
      expect(hero.strip, s.id).toHaveLength(3)
    }
  })

  it('uses registered Designer blocks and the photographs the theme ships', async () => {
    const photos = new Set<string>()
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      for (const p of kit.pages) {
        for (const b of p.blocks) {
          if (b.type.startsWith('Designer')) expect(Object.keys(designerComponents), `${s.id} ${b.type}`).toContain(b.type)
        }
      }
      for (const m of JSON.stringify(kit.pages).matchAll(/"(\/sites\/designer\/photos\/[^"]+)"/g)) photos.add(m[1])
    }
    expect(photos.size).toBeGreaterThanOrEqual(10)
    for (const f of photos) expect(existsSync(join(process.cwd(), 'public', f)), f).toBe(true)
  })

  it('every block is registered and the applied site is valid', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      for (const p of kit.pages) for (const b of p.blocks) expect(config.components[b.type], `${s.id}/${p.slug}: ${b.type}`).toBeTruthy()
      const r = applyKit({ theme: 'Designer', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      expect(r.ok && validWebsiteSnapshot(r.snapshot), s.id).toBe(true)
    }
  })

  it('every page draws without throwing, shows a heading and its photographs', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const r = applyKit({ theme: 'Designer', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      if (!r.ok) throw new Error(r.error)
      for (const p of r.snapshot.pages) {
        const html = renderToStaticMarkup(<BlockRender config={config} data={p.doc as unknown as Data} />)
        expect(html.length, `${s.id}/${p.slug}`).toBeGreaterThan(200)
        expect(html, `${s.id}/${p.slug}`).toMatch(/<h[1-3]/)
      }
      const home = renderToStaticMarkup(<BlockRender config={config} data={r.snapshot.pages[0].doc as unknown as Data} />)
      expect(home, s.id).toContain('class="dz-hero-photo"')
      expect(home, s.id).toContain('dz-strip-thumb')
    }
  })

  it('holds no prices, dashes, invented numbers or testimonials', async () => {
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const text = JSON.stringify((await loadKit(s.id))!.pages)
      expect(text, s.id).not.toMatch(/\$\d|—|\d\s?(minutes?|hours?|weeks?|months?|years?|sq ft)|\b(twenty|twelve|eighteen|nine|eight|six|four|three) (minutes?|hours?|weeks?|months?|years?)\b|within about|Sarah and James/i)
      expect(text, s.id).not.toMatch(/\b(ten|ten-) years\b/i)
    }
  })

  it('every softened line still matches a line of the design, and none of them is left unsoftened', async () => {
    const design = JSON.stringify(kitData)
    for (const [from, to] of Object.entries(SOFTEN)) {
      expect(design, from).toContain(JSON.stringify(from).slice(1, -1))
      expect(to, from).not.toMatch(/\d|—/)
    }
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const text = JSON.stringify((await loadKit(s.id))!.pages)
      for (const from of Object.keys(SOFTEN)) expect(text, `${s.id}: ${from}`).not.toContain(JSON.stringify(from).slice(1, -1))
    }
  })

  it('every link stays inside the kit or a platform page', async () => {
    for (const s of DESIGNER_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const own = new Set([...kit.pages.map((p) => p.slug), 'book', 'contact'])
      const links = [...JSON.stringify(kit).matchAll(/~\/([a-z-]+)/g)].map((m) => m[1])
      expect(links.filter((l) => !own.has(l)), s.id).toEqual([])
    }
  })

  it('names each profile accent from the design tokens', () => {
    expect(designerProfileAccent('general')?.base).toBe('#D3A03F')
    expect(designerProfileAccent('coaches')?.base).toBe('#A65A3A')
    for (const id of PROFILES) expect(designerProfileAccent(id)?.base, id).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
