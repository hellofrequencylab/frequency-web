import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BlockRender } from '@/lib/page-editor/block-render'
import type { Data } from '@/lib/page-editor/types'
import { validWebsiteSnapshot, WEBSITE_THEMES_LIVE } from '@/lib/sites/editor/state'
import { templeKitHomeBlocks } from '@/lib/sites/temple-kit-home'
import { MEGA_NICHES } from '@/lib/theme/mega-theme'
import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { applyKit } from './apply'
import { KIT_INDEX, PROFILE_KIT_INDEX, TEMPLE_KIT_PROFILE_KIT_INDEX, loadKit } from './registry'
import { templeKitProfileAccent } from './temple-kit-profile-variants'

const links = { origin: 'https://frequency.example', slug: 'the-house', siteBase: '', pages: [] as string[], contactHref: '/contact', bookHref: null, email: 'hello@the-house.example' }

describe('Temple Theme Kit profile kits', () => {
  it('there is one for each of the design system\'s thirteen profiles, with its name, on the niche of the same id', async () => {
    expect(TEMPLE_KIT_PROFILE_KIT_INDEX.map((k) => k.niche).sort()).toEqual([...MEGA_NICHES].sort())
    expect(Object.keys(TEMPLE_KIT_PROFILES).sort()).toEqual([...MEGA_NICHES].sort())
    for (const s of TEMPLE_KIT_PROFILE_KIT_INDEX) {
      const kit = await loadKit(s.id)
      expect(kit?.id).toBe(`temple-kit-${s.niche}`)
      expect([kit?.theme, kit?.niche, kit?.label, kit?.description]).toEqual(['TempleKit', s.niche, s.label, s.description])
      expect(kit?.label, s.id).toBe(TEMPLE_KIT_PROFILES[s.niche as keyof typeof TEMPLE_KIT_PROFILES].label)
      expect(kit?.pages[0].slug).toBe('home')
    }
  })

  it('differ by accent only: every kit is the same pages and blocks, and the accent is the profile\'s', async () => {
    const shape = async (id: string) => (await loadKit(id))!.pages.map((p) => [p.slug, p.blocks.map((b) => b.type)])
    const general = await shape('temple-kit-general')
    for (const s of TEMPLE_KIT_PROFILE_KIT_INDEX) {
      expect(await shape(s.id), s.id).toEqual(general)
      expect(templeKitProfileAccent(s.niche), s.id).toBe(TEMPLE_KIT_PROFILES[s.niche as keyof typeof TEMPLE_KIT_PROFILES].accent)
    }
    expect(templeKitProfileAccent('general')).toBe('#9C4A2C')
    expect(templeKitProfileAccent('nope')).toBeNull()
  })

  it('starts a site in the profile\'s accent on Replace, and never overrides an owner\'s own accent or the other two modes', async () => {
    const kit = (await loadKit('temple-kit-coaches'))!
    expect(kit.accent).toBe(TEMPLE_KIT_PROFILES.coaches.accent)
    const fresh = applyKit({ theme: 'Midnight', pages: [] }, kit, 'replace')
    expect(fresh.ok && fresh.snapshot.brand?.accent).toBe(TEMPLE_KIT_PROFILES.coaches.accent)
    const owned = applyKit({ theme: 'Midnight', brand: { accent: '#123456' }, pages: [] }, kit, 'replace')
    expect(owned.ok && owned.snapshot.brand?.accent).toBe('#123456')
    const site = { theme: 'Midnight' as const, pages: fresh.ok ? fresh.snapshot.pages : [] }
    for (const mode of ['theme', 'add'] as const) {
      const r = applyKit(site, kit, mode)
      expect(r.ok && r.snapshot.brand, mode).toBeUndefined()
    }
  })

  it('carries the Programs, Shop and Library inner pages, and not Book (a reserved slug the site serves itself)', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of TEMPLE_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const slugs = kit.pages.map((p) => p.slug)
      for (const slug of ['programs', 'shop', 'library']) expect(slugs, `${s.id} ${slug}`).toContain(slug)
      expect(slugs, s.id).not.toContain('book')
      expect(slugs, s.id).not.toContain('journeys')
      const types = kit.pages.flatMap((p) => p.blocks.map((b) => b.type))
      for (const t of ['TempleKitInnerPrograms', 'TempleKitInnerShop', 'TempleKitInnerLibrary']) expect(types, `${s.id} ${t}`).toContain(t)
      for (const p of kit.pages) expect(JSON.stringify(p.blocks), `${s.id}/${p.slug}`).not.toMatch(/\$\d/)
    }
    for (const t of ['TempleKitInnerPrograms', 'TempleKitInnerShop', 'TempleKitInnerLibrary']) expect(config.components[t], t).toBeTruthy()
    const palette = (config.categories as Record<string, { components: string[] }>).templeKit.components
    for (const t of ['TempleKitInnerPrograms', 'TempleKitInnerShop', 'TempleKitInnerLibrary']) expect(palette, t).toContain(t)
  })

  it('leaves every other theme\'s kit lists as they were', () => {
    expect(KIT_INDEX.some((k) => k.theme === 'TempleKit')).toBe(false)
    expect(PROFILE_KIT_INDEX.some((k) => k.theme === 'TempleKit')).toBe(false)
  })

  it('the Home is the design\'s thirteen Temple Kit blocks in the design\'s order, none of the earlier Temple\'s', async () => {
    const order = templeKitHomeBlocks().map((b) => b.type)
    expect(order).toHaveLength(13)
    for (const s of TEMPLE_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      for (const p of kit.pages) for (const b of p.blocks) expect(b.type.startsWith('TempleKit') || b.type === 'SpaceBooking', `${s.id}/${p.slug}: ${b.type}`).toBe(true)
      expect(kit.pages[0].blocks.map((b) => b.type), s.id).toEqual(order)
    }
  })

  it('every kit applies to a valid site, with every block registered and every link inside the kit or a platform page', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of TEMPLE_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const own = new Set([...kit.pages.map((p) => p.slug), 'book', 'contact'])
      for (const p of kit.pages) for (const b of p.blocks) expect(config.components[b.type], `${s.id}/${p.slug}: ${b.type}`).toBeTruthy()
      const targets = [...JSON.stringify(kit).matchAll(/"~\/([a-z-]*)"/g)].map((m) => m[1]).filter(Boolean)
      expect(targets.filter((t) => !own.has(t)), s.id).toEqual([])
      const r = applyKit({ theme: kit.theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      expect(r.ok && validWebsiteSnapshot(r.snapshot), s.id).toBe(true)
    }
  })

  it('holds a starter\'s words: no dash, price, rating, discount, rhythm or free promise in any kit', async () => {
    const day = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)'
    const banned = [
      /—/,
      /\$\d/,
      /\d+% off/,
      /(?<!step-)\bfree\b/,
      /\b\d+ (?:left|seats)\b/,
      /\bfour (?:times|a year)\b|\bfour a year\b/,
      /\b48 hours\b/,
      new RegExp(`\\b(?:every|each) (?:other )?(?:${day}|week|month|season)s?\\b|\\b${day}s\\b|\\bweekly\\b|\\bmonthly\\b`),
      /"price":"[^"]/,
      /"cost":"[^"]/,
      /"stars":"[1-9]/,
    ]
    for (const s of TEMPLE_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const words = JSON.stringify(kit.pages).replace(/"\/sites\/temple-kit\/photos\/[^"]+"/g, '""').replace(/"(?:monthly|yearly)":/g, '"cost":')
      for (const re of banned) {
        const hit = words.match(new RegExp(`.{0,24}${re.source}.{0,24}`, 'i'))?.[0] ?? null
        expect(hit, `${s.id} ${re}`).toBeNull()
      }
    }
  })

  it('wears a theme the public site serves once a Space publishes it', async () => {
    expect(WEBSITE_THEMES_LIVE.has('TempleKit')).toBe(true)
    const { generalKitId } = await import('@/lib/spaces/starter-site')
    expect(generalKitId('temple-kit')).toBe('temple-kit-general')
    expect((await loadKit(generalKitId('temple-kit')))?.niche).toBe('general')
  })

  it('every page draws without throwing, with a heading, and only the photographs the theme ships', async () => {
    const { config } = await import('@/lib/page-editor/config')
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const s of TEMPLE_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const r = applyKit({ theme: 'TempleKit', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      if (!r.ok) throw new Error(r.error)
      for (const p of r.snapshot.pages) {
        const html = renderToStaticMarkup(<BlockRender config={config} data={p.doc as unknown as Data} metadata={{ links, space: { events: [], series: [] } }} />)
        expect(html.length, `${s.id}/${p.slug}`).toBeGreaterThan(400)
        expect(html, `${s.id}/${p.slug}`).toMatch(/<h1/)
      }
      for (const m of JSON.stringify(kit.pages).matchAll(/"(\/sites\/temple-kit\/photos\/[^"]+)"/g)) expect(existsSync(join(process.cwd(), 'public', m[1]!)), m[1]).toBe(true)
    }
  })
})
