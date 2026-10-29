import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BlockRender } from '@/lib/page-editor/block-render'
import type { Data } from '@/lib/page-editor/types'
import { validWebsiteSnapshot } from '@/lib/sites/editor/state'
import { MEGA_NICHES } from '@/lib/theme/mega-theme'
import { NETWORK_KIT_PROFILES } from '@/lib/theme/network-kit'
import { networkKitProfileName } from '@/lib/spotlight/network-kit-content'
import { applyKit } from './apply'
import { NETWORK_KIT_PROFILE_KITS } from './network-kit-profile-variants'
import { KIT_INDEX, NETWORK_KIT_PROFILE_KIT_INDEX, PROFILE_KIT_INDEX, loadKit } from './registry'

const links = { origin: 'https://frequency.example', slug: 'the-table', siteBase: '', pages: [] as string[], contactHref: '/contact', bookHref: null, email: 'hello@the-table.example' }

describe('Network Theme Kit profile kits', () => {
  it('there is one for each of the design system\'s thirteen profiles, with its name, on the niche of the same id', async () => {
    expect(NETWORK_KIT_PROFILE_KIT_INDEX.map((k) => k.niche).sort()).toEqual([...MEGA_NICHES].sort())
    expect([...NETWORK_KIT_PROFILE_KITS].sort()).toEqual([...NETWORK_KIT_PROFILES].sort())
    for (const s of NETWORK_KIT_PROFILE_KIT_INDEX) {
      const kit = await loadKit(s.id)
      expect(kit?.id).toBe(`network-kit-${s.niche}`)
      expect([kit?.theme, kit?.niche, kit?.label, kit?.description]).toEqual(['NetworkKit', s.niche, s.label, s.description])
      expect(kit?.label, s.id).toBe(networkKitProfileName(s.niche))
      expect(kit?.pages[0].slug).toBe('home')
    }
  })

  it('leaves every other theme\'s kit lists as they were', () => {
    expect(KIT_INDEX.some((k) => k.theme === 'NetworkKit')).toBe(false)
    expect(PROFILE_KIT_INDEX.some((k) => k.theme === 'NetworkKit')).toBe(false)
  })

  it('lays the home out in the design\'s order of blocks, hero first, and names the layout variants the design\'s kit names', async () => {
    for (const s of NETWORK_KIT_PROFILE_KIT_INDEX) {
      const home = (await loadKit(s.id))!.pages[0]
      const types = home.blocks.map((b) => b.type)
      expect(types[0], s.id).toBe('NetworkKitHero')
      expect(types.every((t) => t.startsWith('NetworkKit')), s.id).toBe(true)
      expect(new Set(types).size, s.id).toBe(types.length)
    }
    const get = async (niche: string, type: string) => ((await loadKit(`network-kit-${niche}`))!.pages[0].blocks.find((b) => b.type === type)?.props ?? {}) as Record<string, unknown>
    expect((await get('studios', 'NetworkKitHero')).variant).toBe('full')
    expect((await get('hosts', 'NetworkKitHero')).variant).toBe('center')
    expect((await get('venues', 'NetworkKitHero')).flip).toBe(true)
    expect((await get('networks', 'NetworkKitDoors')).variant).toBe('tiles')
    expect((await get('nonprofits', 'NetworkKitMembership')).variant).toBe('spotlight')
    expect((await get('creators', 'NetworkKitShop')).variant).toBe('rail')
    expect((await get('schools', 'NetworkKitJourneys')).variant).toBe('feature')
    expect((await get('faith', 'NetworkKitLibrary')).variant).toBe('list')
    expect((await get('coaches', 'NetworkKitCTA')).variant).toBe('split')
    const general = (await loadKit('network-kit-general'))!.pages[0].blocks.map((b) => b.type)
    for (const t of ['Stats', 'Venue', 'Featured', 'Calendar', 'Chapters', 'Circles', 'Note', 'Pillars', 'Rooms', 'Podcast', 'Social', 'Merch', 'Contact']) expect(general, t).toContain('NetworkKit' + t)
  })

  it('has a page for every place a button on the home goes, and only for tools the profile has on', async () => {
    for (const s of NETWORK_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const slugs = new Set(kit.pages.map((p) => p.slug))
      const to = new Set([...JSON.stringify(kit.pages[0].blocks).matchAll(/"~\/([a-z-]+)"/g)].map((m) => m[1]!))
      // book and contact resolve to the Space's own booking and contact doors; the rest are pages of the site.
      for (const t of to) if (t !== 'book' && t !== 'contact') expect(slugs.has(t), `${s.id} links ~/${t}`).toBe(true)
      expect(slugs.has('about') && slugs.has('resources'), s.id).toBe(true)
    }
    const slugs = async (n: string) => (await loadKit(`network-kit-${n}`))!.pages.map((p) => p.slug)
    expect(await slugs('hosts')).not.toContain('shop')
    expect(await slugs('schools')).toContain('journeys')
    expect(await slugs('wellness')).toEqual(expect.arrayContaining(['services', 'shop', 'workshops']))
  })

  it('every block is registered and the applied site is valid and publishable', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of NETWORK_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      for (const p of kit.pages) for (const b of p.blocks) expect(config.components[b.type], `${s.id}/${p.slug}: ${b.type}`).toBeTruthy()
      const r = applyKit({ theme: 'NetworkKit', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      expect(r.ok && validWebsiteSnapshot(r.snapshot), s.id).toBe(true)
    }
  })

  it('every page draws without throwing, with a heading, and only the photographs the theme ships', async () => {
    const { config } = await import('@/lib/page-editor/config')
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const s of NETWORK_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      const r = applyKit({ theme: 'NetworkKit', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
      if (!r.ok) throw new Error(r.error)
      for (const p of r.snapshot.pages) {
        const html = renderToStaticMarkup(<BlockRender config={config} data={p.doc as unknown as Data} metadata={{ links, space: { events: [], series: [] } }} />)
        expect(html.length, `${s.id}/${p.slug}`).toBeGreaterThan(400)
        expect(html, `${s.id}/${p.slug}`).toMatch(/<h1/)
      }
      for (const m of JSON.stringify(kit.pages).matchAll(/"(\/sites\/network-kit\/photos\/[^"]+)"/g)) expect(existsSync(join(process.cwd(), 'public', m[1]!)), m[1]).toBe(true)
    }
  })

  it('keeps the voice: no dash, invented number, weekday promise, price, cohort or placeholder prompt in any kit', async () => {
    const day = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)'
    const banned = [
      /—/,
      /\d/,
      new RegExp(`\\b(?:every|each) (?:other )?(?:${day}|week|month)s?\\b|\\b${day}s\\b|\\bweekly\\b|\\bmonthly\\b|\\bfirst ${day}\\b`),
      /\bunlock\b|\bcohorts?\b|\bfree\b/,
      /\b(?:add your|say how|say if|one line|one sentence|your city|sample)\b/,
      /"price":"[^"]/,
    ]
    for (const s of NETWORK_KIT_PROFILE_KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      // The numbers a block takes as settings (how many to show), the photo's crop and the {{token|fallback}} fields are not words.
      const words = JSON.stringify(kit.pages).replace(/"count":\d+|"pos":"[^"]*"|\{\{[^}]*\}\}|"\/sites\/network-kit\/photos\/[^"]+"/g, '""')
      for (const re of banned) {
        const hit = words.match(new RegExp(`.{0,24}${re.source}.{0,24}`, 'i'))?.[0] ?? null
        expect(hit, `${s.id} ${re}`).toBeNull()
      }
    }
  })

  it('the starter site a new Space on this look publishes is the General kit', async () => {
    const { generalKitId } = await import('@/lib/spaces/starter-site')
    expect(generalKitId('network-kit')).toBe('network-kit-general')
    expect((await loadKit(generalKitId('network-kit')))?.niche).toBe('general')
  })
})
