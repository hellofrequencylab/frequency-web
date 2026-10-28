import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BlockRender } from '@/lib/page-editor/block-render'
import type { Data } from '@/lib/page-editor/types'
import { validWebsiteSnapshot, WEBSITE_THEMES_LIVE } from '@/lib/sites/editor/state'
import { MEGA_PROFILE_NICHES, MEGA_THEMES } from '@/lib/theme/mega-theme'
import { applyKit } from './apply'
import { PROFILE_KIT_INDEX, loadKit } from './registry'

// Every theme x every profile niche (general, creators, schools, clubs, faith, wellness, markets): one kit each.
describe('profile kits', () => {
  it('every theme has a kit for every profile, with id <prefix>-<niche>', () => {
    // The Network Theme Kit (`network-kit`) is registered as a theme first and gets its thirteen kits with the kit registry pass.
    const withKits = MEGA_THEMES.filter((t) => t.id !== 'network-kit')
    expect(PROFILE_KIT_INDEX).toHaveLength(withKits.length * MEGA_PROFILE_NICHES.length)
    for (const niche of MEGA_PROFILE_NICHES) expect(PROFILE_KIT_INDEX.filter((k) => k.niche === niche)).toHaveLength(withKits.length)
    expect(new Set(PROFILE_KIT_INDEX.map((k) => k.id)).size).toBe(PROFILE_KIT_INDEX.length)
  })

  it('each loads, matches its summary, wears a live theme, and every block is registered and applies to a valid site', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of PROFILE_KIT_INDEX) {
      const kit = await loadKit(s.id)
      expect(kit, s.id).not.toBeNull()
      expect([kit!.niche, kit!.theme, kit!.label, kit!.id]).toEqual([s.niche, s.theme, s.label, s.id])
      if (kit!.theme !== 'DAWN') expect(WEBSITE_THEMES_LIVE.has(kit!.theme), s.id).toBe(true)
      expect(kit!.pages.map((p) => p.slug)).toContain('home')
      for (const p of kit!.pages) for (const b of p.blocks) expect(config.components[b.type], `${s.id}/${p.slug}: ${b.type}`).toBeTruthy()
      const r = applyKit({ theme: kit!.theme, pages: [] } as never, kit!, 'replace', (type) => config.components[type]?.defaultProps)
      expect(r.ok && validWebsiteSnapshot(r.snapshot), s.id).toBe(true)
    }
  })

  it('holds no prices, photos, dashes or real names', async () => {
    for (const s of PROFILE_KIT_INDEX) expect(JSON.stringify(await loadKit(s.id)), s.id).not.toMatch(/\$\d|\.jpg|\.png|\.webp|—|Royal Temple|Vista/)
  })

  it('every link stays inside the kit or a platform page', async () => {
    for (const s of PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const own = new Set([...kit.pages.map((p) => p.slug), 'book', 'contact'])
      const links = [...JSON.stringify(kit).matchAll(/~\/([a-z-]+)/g)].map((m) => m[1])
      expect(links.filter((l) => !own.has(l)), s.id).toEqual([])
    }
  })

  it('every page draws without throwing and shows a heading', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const r = applyKit({ theme: kit.theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      if (!r.ok) throw new Error(r.error)
      for (const p of r.snapshot.pages) {
        const html = renderToStaticMarkup(<BlockRender config={config} data={p.doc as unknown as Data} />)
        expect(html.length, `${s.id}/${p.slug}`).toBeGreaterThan(200)
        expect(html, `${s.id}/${p.slug}`).toMatch(/<h[1-3]/)
      }
    }
  })
  it('every General kit carries a "join" page with an email sign-up block; no other profile does', async () => {
    const SIGNUP = new Set(['MidnightLetter', 'TempleFollow', 'SpaceJoinList'])
    for (const s of PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const join = kit.pages.find((p) => p.slug === 'join')
      if (s.niche !== 'general') { expect(join, s.id).toBeUndefined(); continue }
      expect(join, s.id).toBeDefined()
      expect(join!.blocks.some((b) => SIGNUP.has(b.type)), s.id).toBe(true)
    }
  })
})
